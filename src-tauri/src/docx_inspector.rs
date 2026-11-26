use crate::models::{
    DocBlock, DocDocument, ExtractedStyleResult, StyleProfile, TextRun, TextStyleSpec,
};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use uuid::Uuid;
use zip::ZipArchive;

fn twips_to_mm(twips: f64) -> f64 {
    ((twips / 56.6929133858) * 10.0).round() / 10.0
}

fn twips_to_pt(twips: f64) -> f64 {
    ((twips / 20.0) * 10.0).round() / 10.0
}

fn attr_val<'a>(e: &'a quick_xml::events::BytesStart<'a>, key: &str) -> Option<String> {
    let short_key = key.split(':').last().unwrap_or(key);
    for attr in e.attributes().flatten() {
        let k = String::from_utf8_lossy(attr.key.as_ref());
        if k == key || k.split(':').last() == Some(short_key) {
            return Some(String::from_utf8_lossy(&attr.value).to_string());
        }
    }
    None
}

fn read_zip_entry(path: &str, entry_name: &str) -> Result<Option<String>, String> {
    let file = File::open(path).map_err(|e| format!("无法打开文件 {path}: {e}"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("无效的 .docx 压缩包: {e}"))?;
    let entry = archive.by_name(entry_name);
    match entry {
        Ok(mut f) => {
            let mut s = String::new();
            f.read_to_string(&mut s)
                .map_err(|e| format!("读取 {entry_name} 失败: {e}"))?;
            Ok(Some(s))
        }
        Err(_) => Ok(None),
    }
}

#[derive(Default, Clone)]
struct ParsedStyleProps {
    style_id: String,
    name: String,
    based_on: Option<String>,
    font_zh: Option<String>,
    font_en: Option<String>,
    size_pt: Option<f64>,
    bold: Option<bool>,
    italic: Option<bool>,
    color: Option<String>,
    align: Option<String>,
    line_spacing_rule: Option<String>,
    line_spacing_value: Option<f64>,
    space_before_pt: Option<f64>,
    space_after_pt: Option<f64>,
    first_line_indent_chars: Option<f64>,
}

fn parse_styles_xml(xml: &str) -> HashMap<String, ParsedStyleProps> {
    let mut map = HashMap::new();
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();
    let mut cur: Option<ParsedStyleProps> = None;
    let mut in_ppr = false;
    let mut in_rpr = false;
    let mut in_doc_defaults = false;
    let mut doc_default = ParsedStyleProps {
        style_id: "__doc_default__".to_string(),
        name: "DocDefaults".to_string(),
        ..Default::default()
    };

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(ref ev @ (Event::Start(ref e) | Event::Empty(ref e))) => {
                let is_start = matches!(ev, Event::Start(_));
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let local = tag.split(':').last().unwrap_or(&tag);
                match local {
                    "docDefaults" if is_start => in_doc_defaults = true,
                    "style" if is_start => {
                        let stype = attr_val(e, "w:type").unwrap_or_default();
                        if stype == "paragraph" || stype.is_empty() {
                            let sid = attr_val(e, "w:styleId").unwrap_or_default();
                            cur = Some(ParsedStyleProps {
                                style_id: sid,
                                ..Default::default()
                            });
                        }
                    }
                    "name" => {
                        if let Some(ref mut s) = cur {
                            if let Some(v) = attr_val(e, "w:val") {
                                s.name = v;
                            }
                        }
                    }
                    "basedOn" => {
                        if let Some(ref mut s) = cur {
                            s.based_on = attr_val(e, "w:val");
                        }
                    }
                    "pPr" if is_start => in_ppr = true,
                    "rPr" if is_start => in_rpr = true,
                    "rFonts" if in_rpr => {
                        let target = if let Some(ref mut s) = cur {
                            Some(s)
                        } else if in_doc_defaults {
                            Some(&mut doc_default)
                        } else {
                            None
                        };
                        if let Some(s) = target {
                            if let Some(ea) = attr_val(e, "w:eastAsia") {
                                if !ea.is_empty() {
                                    s.font_zh = Some(ea);
                                }
                            }
                            if let Some(asc) = attr_val(e, "w:ascii").or_else(|| attr_val(e, "w:hAnsi")) {
                                if !asc.is_empty() {
                                    s.font_en = Some(asc);
                                }
                            }
                        }
                    }
                    "sz" if in_rpr => {
                        let target = if let Some(ref mut s) = cur {
                            Some(s)
                        } else if in_doc_defaults {
                            Some(&mut doc_default)
                        } else {
                            None
                        };
                        if let Some(s) = target {
                            if let Some(v) = attr_val(e, "w:val").and_then(|x| x.parse::<f64>().ok()) {
                                s.size_pt = Some((v / 2.0 * 10.0).round() / 10.0);
                            }
                        }
                    }
                    "b" if in_rpr => {
                        if let Some(ref mut s) = cur {
                            let val = attr_val(e, "w:val");
                            s.bold = Some(val.as_deref() != Some("0") && val.as_deref() != Some("false"));
                        }
                    }
                    "i" if in_rpr => {
                        if let Some(ref mut s) = cur {
                            let val = attr_val(e, "w:val");
                            s.italic = Some(val.as_deref() != Some("0") && val.as_deref() != Some("false"));
                        }
                    }
                    "color" if in_rpr => {
                        if let Some(ref mut s) = cur {
                            if let Some(v) = attr_val(e, "w:val") {
                                if v != "auto" && v.len() == 6 {
                                    s.color = Some(format!("#{}", v.to_uppercase()));
                                }
                            }
                        }
                    }
                    "jc" if in_ppr => {
                        if let Some(ref mut s) = cur {
                            if let Some(v) = attr_val(e, "w:val") {
                                s.align = Some(match v.as_str() {
                                    "both" => "justify".to_string(),
                                    other => other.to_string(),
                                });
                            }
                        }
                    }
                    "spacing" if in_ppr => {
                        let target = if let Some(ref mut s) = cur {
                            Some(s)
                        } else if in_doc_defaults {
                            Some(&mut doc_default)
                        } else {
                            None
                        };
                        if let Some(s) = target {
                            if let Some(b) = attr_val(e, "w:before").and_then(|x| x.parse::<f64>().ok()) {
                                s.space_before_pt = Some(twips_to_pt(b));
                            }
                            if let Some(a) = attr_val(e, "w:after").and_then(|x| x.parse::<f64>().ok()) {
                                s.space_after_pt = Some(twips_to_pt(a));
                            }
                            if let Some(line) = attr_val(e, "w:line").and_then(|x| x.parse::<f64>().ok()) {
                                let rule = attr_val(e, "w:lineRule").unwrap_or_else(|| "auto".to_string());
                                if rule == "exact" || rule == "atLeast" {
                                    s.line_spacing_rule = Some("exact".to_string());
                                    s.line_spacing_value = Some(twips_to_pt(line));
                                } else {
                                    s.line_spacing_rule = Some("multiple".to_string());
                                    s.line_spacing_value = Some(((line / 240.0) * 100.0).round() / 100.0);
                                }
                            }
                        }
                    }
                    "ind" if in_ppr => {
                        if let Some(ref mut s) = cur {
                            if let Some(chars) = attr_val(e, "w:firstLineChars").and_then(|x| x.parse::<f64>().ok()) {
                                s.first_line_indent_chars = Some((chars / 100.0 * 10.0).round() / 10.0);
                            } else if let Some(fl) = attr_val(e, "w:firstLine").and_then(|x| x.parse::<f64>().ok()) {
                                let pt = s.size_pt.or(doc_default.size_pt).unwrap_or(12.0);
                                let chars = (twips_to_pt(fl) / pt * 10.0).round() / 10.0;
                                s.first_line_indent_chars = Some(chars);
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let local = tag.split(':').last().unwrap_or(&tag);
                match local {
                    "docDefaults" => in_doc_defaults = false,
                    "pPr" => in_ppr = false,
                    "rPr" => in_rpr = false,
                    "style" => {
                        if let Some(s) = cur.take() {
                            if !s.style_id.is_empty() {
                                map.insert(s.style_id.clone(), s);
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    map.insert("__doc_default__".to_string(), doc_default);
    map
}

fn resolve_style_chain(
    map: &HashMap<String, ParsedStyleProps>,
    candidates: &[&str],
) -> Option<ParsedStyleProps> {
    let mut found: Option<&ParsedStyleProps> = None;
    for cand in candidates {
        if let Some(s) = map.get(*cand) {
            found = Some(s);
            break;
        }
        // Fallback match by style name case-insensitive
        if let Some(s) = map.values().find(|v| v.name.eq_ignore_ascii_case(cand)) {
            found = Some(s);
            break;
        }
    }
    let start = found?;
    let mut chain = vec![start];
    let mut cur = start;
    for _ in 0..5 {
        if let Some(ref base_id) = cur.based_on {
            if let Some(parent) = map.get(base_id) {
                chain.push(parent);
                cur = parent;
                continue;
            }
        }
        break;
    }
    if let Some(def) = map.get("__doc_default__") {
        chain.push(def);
    }

    let mut merged = ParsedStyleProps {
        style_id: start.style_id.clone(),
        name: start.name.clone(),
        ..Default::default()
    };
    for node in chain.into_iter().rev() {
        if node.font_zh.is_some() {
            merged.font_zh = node.font_zh.clone();
        }
        if node.font_en.is_some() {
            merged.font_en = node.font_en.clone();
        }
        if node.size_pt.is_some() {
            merged.size_pt = node.size_pt;
        }
        if node.bold.is_some() {
            merged.bold = node.bold;
        }
        if node.italic.is_some() {
            merged.italic = node.italic;
        }
        if node.color.is_some() {
            merged.color = node.color.clone();
        }
        if node.align.is_some() {
            merged.align = node.align.clone();
        }
        if node.line_spacing_rule.is_some() {
            merged.line_spacing_rule = node.line_spacing_rule.clone();
        }
        if node.line_spacing_value.is_some() {
            merged.line_spacing_value = node.line_spacing_value;
        }
        if node.space_before_pt.is_some() {
            merged.space_before_pt = node.space_before_pt;
        }
        if node.space_after_pt.is_some() {
            merged.space_after_pt = node.space_after_pt;
        }
        if node.first_line_indent_chars.is_some() {
            merged.first_line_indent_chars = node.first_line_indent_chars;
        }
    }
    Some(merged)
}

fn apply_parsed_to_spec(
    label: &str,
    parsed: &ParsedStyleProps,
    spec: &mut TextStyleSpec,
    summary: &mut Vec<String>,
) {
    let mut parts = Vec::new();
    if let Some(ref f) = parsed.font_zh {
        spec.font_zh = f.clone();
        parts.push(format!("中文字体 {}", f));
    }
    if let Some(ref f) = parsed.font_en {
        spec.font_en = f.clone();
        parts.push(format!("西文字体 {}", f));
    }
    if let Some(sz) = parsed.size_pt {
        spec.size_pt = sz;
        parts.push(format!("字号 {}pt", sz));
    }
    if let Some(b) = parsed.bold {
        spec.bold = b;
    }
    if let Some(i) = parsed.italic {
        spec.italic = i;
    }
    if let Some(ref c) = parsed.color {
        spec.color = c.clone();
    }
    if let Some(ref a) = parsed.align {
        spec.align = a.clone();
    }
    if let Some(ref rule) = parsed.line_spacing_rule {
        spec.line_spacing_rule = rule.clone();
    }
    if let Some(val) = parsed.line_spacing_value {
        spec.line_spacing_value = val;
        let unit = if spec.line_spacing_rule == "exact" {
            "pt"
        } else {
            "倍"
        };
        parts.push(format!("行距 {}{}", val, unit));
    }
    if let Some(sb) = parsed.space_before_pt {
        spec.space_before_pt = sb;
    }
    if let Some(sa) = parsed.space_after_pt {
        spec.space_after_pt = sa;
    }
    if let Some(ind) = parsed.first_line_indent_chars {
        spec.first_line_indent_chars = ind;
        if ind > 0.0 {
            parts.push(format!("首行缩进 {}字符", ind));
        }
    }
    if !parts.is_empty() {
        summary.push(format!("{}：{}", label, parts.join(" · ")));
    }
}

pub fn extract_docx_style_profile(
    path: &str,
    mut base_profile: StyleProfile,
) -> Result<ExtractedStyleResult, String> {
    let file_stem = Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("提取模板");

    let mut summary = Vec::new();
    base_profile.id = format!("custom-{}", &Uuid::new_v4().to_string()[..8]);
    base_profile.name = format!("{} (范文提取)", file_stem);
    base_profile.description = format!("从范文《{}》自动解析提取的版式与样式规范", file_stem);
    base_profile.category = "custom".to_string();

    // 1. Parse page size & margins from word/document.xml
    if let Some(doc_xml) = read_zip_entry(path, "word/document.xml")? {
        let mut reader = Reader::from_str(&doc_xml);
        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    let local = tag.split(':').last().unwrap_or(&tag);
                    if local == "pgSz" {
                        if let Some(w) = attr_val(e, "w:w").and_then(|v| v.parse::<f64>().ok()) {
                            base_profile.page.width_mm = twips_to_mm(w);
                        }
                        if let Some(h) = attr_val(e, "w:h").and_then(|v| v.parse::<f64>().ok()) {
                            base_profile.page.height_mm = twips_to_mm(h);
                        }
                    } else if local == "pgMar" {
                        if let Some(v) = attr_val(e, "w:top").and_then(|v| v.parse::<f64>().ok()) {
                            base_profile.page.margin_top_mm = twips_to_mm(v);
                        }
                        if let Some(v) = attr_val(e, "w:bottom").and_then(|v| v.parse::<f64>().ok()) {
                            base_profile.page.margin_bottom_mm = twips_to_mm(v);
                        }
                        if let Some(v) = attr_val(e, "w:left").and_then(|v| v.parse::<f64>().ok()) {
                            base_profile.page.margin_left_mm = twips_to_mm(v);
                        }
                        if let Some(v) = attr_val(e, "w:right").and_then(|v| v.parse::<f64>().ok()) {
                            base_profile.page.margin_right_mm = twips_to_mm(v);
                        }
                        summary.push(format!(
                            "页面与边距：{}×{}mm（上{} 下{} 左{} 右{}mm）",
                            base_profile.page.width_mm,
                            base_profile.page.height_mm,
                            base_profile.page.margin_top_mm,
                            base_profile.page.margin_bottom_mm,
                            base_profile.page.margin_left_mm,
                            base_profile.page.margin_right_mm
                        ));
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }
    }

    // 2. Parse word/styles.xml
    if let Some(styles_xml) = read_zip_entry(path, "word/styles.xml")? {
        let style_map = parse_styles_xml(&styles_xml);

        if let Some(s) = resolve_style_chain(&style_map, &["Normal", "a", "正文"]) {
            apply_parsed_to_spec("正文", &s, &mut base_profile.typography.body, &mut summary);
        }
        if let Some(s) = resolve_style_chain(&style_map, &["OneDocTitle", "Title", "标题"]) {
            apply_parsed_to_spec("主标题", &s, &mut base_profile.typography.title, &mut summary);
        }
        if let Some(s) = resolve_style_chain(&style_map, &["OneDocSubtitle", "Subtitle", "副标题"]) {
            apply_parsed_to_spec("副标题", &s, &mut base_profile.typography.subtitle, &mut summary);
        }
        if let Some(s) = resolve_style_chain(&style_map, &["Heading1", "1", "heading 1", "标题 1"]) {
            apply_parsed_to_spec("一级标题", &s, &mut base_profile.typography.h1, &mut summary);
        }
        if let Some(s) = resolve_style_chain(&style_map, &["Heading2", "2", "heading 2", "标题 2"]) {
            apply_parsed_to_spec("二级标题", &s, &mut base_profile.typography.h2, &mut summary);
        }
        if let Some(s) = resolve_style_chain(&style_map, &["Heading3", "3", "heading 3", "标题 3"]) {
            apply_parsed_to_spec("三级标题", &s, &mut base_profile.typography.h3, &mut summary);
        }
        if let Some(s) = resolve_style_chain(&style_map, &["Heading4", "4", "heading 4", "标题 4"]) {
            apply_parsed_to_spec("四级标题", &s, &mut base_profile.typography.h4, &mut summary);
        }
    }

    if summary.is_empty() {
        summary.push("未检测到显式样式表，已保留基准模板配置".to_string());
    }

    Ok(ExtractedStyleResult {
        profile: base_profile,
        summary,
    })
}

pub fn import_docx_to_ast(path: &str, style_profile_id: &str) -> Result<DocDocument, String> {
    let doc_xml = read_zip_entry(path, "word/document.xml")?
        .ok_or_else(|| "文件中缺少 word/document.xml".to_string())?;

    let title_fallback = Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("导入的文档")
        .to_string();

    let mut reader = Reader::from_str(&doc_xml);
    let mut buf = Vec::new();
    let mut blocks: Vec<DocBlock> = Vec::new();

    let mut in_tbl = false;
    let mut tbl_rows: Vec<Vec<String>> = Vec::new();
    let mut cur_row: Vec<String> = Vec::new();
    let mut in_tc = false;
    let mut cell_text = String::new();

    let mut in_p = false;
    let mut in_r = false;
    let mut in_t = false;
    let mut cur_p_style: Option<String> = None;
    let mut cur_outline_lvl: Option<u8> = None;
    let mut cur_runs: Vec<TextRun> = Vec::new();
    let mut cur_run_text = String::new();
    let mut cur_bold = false;
    let mut cur_italic = false;
    let mut cur_underline = false;
    let mut cur_color: Option<String> = None;
    let mut is_page_break = false;
    let mut seen_title = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let local = tag.split(':').last().unwrap_or(&tag);
                match local {
                    "tbl" => {
                        in_tbl = true;
                        tbl_rows.clear();
                    }
                    "tr" if in_tbl => cur_row.clear(),
                    "tc" if in_tbl => {
                        in_tc = true;
                        cell_text.clear();
                    }
                    "p" if !in_tbl => {
                        in_p = true;
                        cur_p_style = None;
                        cur_outline_lvl = None;
                        cur_runs.clear();
                        is_page_break = false;
                    }
                    "pStyle" if in_p => {
                        cur_p_style = attr_val(e, "w:val");
                    }
                    "outlineLvl" if in_p => {
                        cur_outline_lvl = attr_val(e, "w:val").and_then(|v| v.parse::<u8>().ok());
                    }
                    "r" if in_p && !in_tbl => {
                        in_r = true;
                        cur_run_text.clear();
                        cur_bold = false;
                        cur_italic = false;
                        cur_underline = false;
                        cur_color = None;
                    }
                    "b" if in_r => {
                        let val = attr_val(e, "w:val");
                        cur_bold = val.as_deref() != Some("0");
                    }
                    "i" if in_r => {
                        let val = attr_val(e, "w:val");
                        cur_italic = val.as_deref() != Some("0");
                    }
                    "u" if in_r => {
                        let val = attr_val(e, "w:val");
                        cur_underline = val.as_deref() != Some("none");
                    }
                    "color" if in_r => {
                        if let Some(c) = attr_val(e, "w:val") {
                            if c != "auto" && c.len() == 6 {
                                cur_color = Some(format!("#{}", c.to_uppercase()));
                            }
                        }
                    }
                    "t" if in_r || in_tc => {
                        in_t = true;
                    }
                    "br" if in_r => {
                        if attr_val(e, "w:type").as_deref() == Some("page") {
                            is_page_break = true;
                        } else {
                            cur_run_text.push('\n');
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let local = tag.split(':').last().unwrap_or(&tag);
                match local {
                    "pStyle" if in_p => {
                        cur_p_style = attr_val(e, "w:val");
                    }
                    "outlineLvl" if in_p => {
                        cur_outline_lvl = attr_val(e, "w:val").and_then(|v| v.parse::<u8>().ok());
                    }
                    "b" if in_r => {
                        let val = attr_val(e, "w:val");
                        cur_bold = val.as_deref() != Some("0");
                    }
                    "i" if in_r => {
                        let val = attr_val(e, "w:val");
                        cur_italic = val.as_deref() != Some("0");
                    }
                    "u" if in_r => {
                        let val = attr_val(e, "w:val");
                        cur_underline = val.as_deref() != Some("none");
                    }
                    "color" if in_r => {
                        if let Some(c) = attr_val(e, "w:val") {
                            if c != "auto" && c.len() == 6 {
                                cur_color = Some(format!("#{}", c.to_uppercase()));
                            }
                        }
                    }
                    "br" if in_r => {
                        if attr_val(e, "w:type").as_deref() == Some("page") {
                            is_page_break = true;
                        } else {
                            cur_run_text.push('\n');
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_t {
                    if let Ok(txt) = e.unescape() {
                        if in_tc {
                            cell_text.push_str(&txt);
                        } else if in_r {
                            cur_run_text.push_str(&txt);
                        }
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let local = tag.split(':').last().unwrap_or(&tag);
                match local {
                    "t" => in_t = false,
                    "r" if in_r => {
                        in_r = false;
                        if !cur_run_text.is_empty() {
                            cur_runs.push(TextRun {
                                text: cur_run_text.clone(),
                                bold: if cur_bold { Some(true) } else { None },
                                italic: if cur_italic { Some(true) } else { None },
                                underline: if cur_underline { Some(true) } else { None },
                                code: None,
                                color: cur_color.clone(),
                            });
                        }
                    }
                    "p" if in_p && !in_tbl => {
                        in_p = false;
                        let id = format!("b-{}", &Uuid::new_v4().to_string()[..8]);
                        if is_page_break && cur_runs.is_empty() {
                            blocks.push(DocBlock::PageBreak { id });
                        } else {
                            let full_text: String =
                                cur_runs.iter().map(|r| r.text.as_str()).collect();
                            let trimmed = full_text.trim();
                            if !trimmed.is_empty() {
                                let style_l = cur_p_style
                                    .as_deref()
                                    .unwrap_or("")
                                    .to_lowercase();
                                if style_l.contains("title") && !style_l.contains("sub") && !seen_title {
                                    seen_title = true;
                                    blocks.push(DocBlock::Title {
                                        id,
                                        text: trimmed.to_string(),
                                    });
                                } else if style_l.contains("subtitle") {
                                    blocks.push(DocBlock::Subtitle {
                                        id,
                                        text: trimmed.to_string(),
                                    });
                                } else if style_l.contains("heading1")
                                    || style_l == "1"
                                    || cur_outline_lvl == Some(0)
                                {
                                    blocks.push(DocBlock::Heading {
                                        id,
                                        level: 1,
                                        text: trimmed.to_string(),
                                    });
                                } else if style_l.contains("heading2")
                                    || style_l == "2"
                                    || cur_outline_lvl == Some(1)
                                {
                                    blocks.push(DocBlock::Heading {
                                        id,
                                        level: 2,
                                        text: trimmed.to_string(),
                                    });
                                } else if style_l.contains("heading3")
                                    || style_l == "3"
                                    || cur_outline_lvl == Some(2)
                                {
                                    blocks.push(DocBlock::Heading {
                                        id,
                                        level: 3,
                                        text: trimmed.to_string(),
                                    });
                                } else if style_l.contains("heading4")
                                    || style_l == "4"
                                    || cur_outline_lvl == Some(3)
                                {
                                    blocks.push(DocBlock::Heading {
                                        id,
                                        level: 4,
                                        text: trimmed.to_string(),
                                    });
                                } else if style_l.contains("quote") {
                                    blocks.push(DocBlock::Quote {
                                        id,
                                        title: None,
                                        text: trimmed.to_string(),
                                        variant: None,
                                    });
                                } else {
                                    blocks.push(DocBlock::Paragraph {
                                        id,
                                        runs: cur_runs.clone(),
                                        indent: None,
                                        align: None,
                                    });
                                }
                            }
                        }
                    }
                    "tc" if in_tc => {
                        in_tc = false;
                        cur_row.push(cell_text.trim().to_string());
                    }
                    "tr" if in_tbl => {
                        if !cur_row.is_empty() {
                            tbl_rows.push(cur_row.clone());
                        }
                    }
                    "tbl" if in_tbl => {
                        in_tbl = false;
                        if !tbl_rows.is_empty() {
                            let headers = tbl_rows.remove(0);
                            blocks.push(DocBlock::Table {
                                id: format!("b-{}", &Uuid::new_v4().to_string()[..8]),
                                caption: None,
                                headers,
                                rows: tbl_rows.clone(),
                            });
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("解析文档 XML 出错: {e}")),
            _ => {}
        }
        buf.clear();
    }

    let doc_title = blocks
        .iter()
        .find_map(|b| match b {
            DocBlock::Title { text, .. } => Some(text.clone()),
            _ => None,
        })
        .unwrap_or(title_fallback);

    Ok(DocDocument {
        id: format!("doc-{}", &Uuid::new_v4().to_string()[..8]),
        title: doc_title,
        style_profile_id: style_profile_id.to_string(),
        blocks,
        updated_at: String::new(),
    })
}

pub fn extract_docx_text(path: &str) -> Result<String, String> {
    let doc = import_docx_to_ast(path, "default")?;
    let mut out = Vec::new();
    for block in doc.blocks {
        match block {
            DocBlock::Title { text, .. } => out.push(format!("# {}", text)),
            DocBlock::Subtitle { text, .. } => out.push(text),
            DocBlock::Heading { level, text, .. } => {
                out.push(format!("{} {}", "#".repeat(level as usize), text))
            }
            DocBlock::Paragraph { runs, .. } => {
                let s: String = runs.into_iter().map(|r| r.text).collect();
                out.push(s);
            }
            DocBlock::Quote { text, .. } => out.push(format!("> {}", text)),
            DocBlock::Table { headers, rows, .. } => {
                out.push(format!("| {} |", headers.join(" | ")));
                for r in rows {
                    out.push(format!("| {} |", r.join(" | ")));
                }
            }
            DocBlock::CodeBlock { code, .. } => out.push(code),
            DocBlock::List { items, .. } => {
                for item in items {
                    let s: String = item.into_iter().map(|r| r.text).collect();
                    out.push(format!("- {}", s));
                }
            }
            DocBlock::Divider { .. } | DocBlock::PageBreak { .. } => {}
        }
    }
    Ok(out.join("\n\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::docx_compiler::{compile_docx_to_file, sample_gbt9704_style};

    #[test]
    fn test_round_trip_style_extraction_and_ast_import() {
        let style = sample_gbt9704_style();
        let doc = DocDocument {
            id: "doc-rt".to_string(),
            title: "年度工作总结报告".to_string(),
            style_profile_id: style.id.clone(),
            updated_at: "2026-11-23".to_string(),
            blocks: vec![
                DocBlock::Title {
                    id: "t1".to_string(),
                    text: "年度工作总结报告".to_string(),
                },
                DocBlock::Heading {
                    id: "h1".to_string(),
                    level: 1,
                    text: "工作成效".to_string(),
                },
                DocBlock::Paragraph {
                    id: "p1".to_string(),
                    runs: vec![TextRun::plain("全年核心指标圆满完成。")],
                    indent: None,
                    align: None,
                },
                DocBlock::Table {
                    id: "tb1".to_string(),
                    caption: None,
                    headers: vec!["指标".to_string(), "数值".to_string()],
                    rows: vec![vec!["完成率".to_string(), "99.5%".to_string()]],
                },
            ],
        };

        let tmp_dir = std::env::temp_dir().join("onedoc_inspector_test");
        std::fs::create_dir_all(&tmp_dir).unwrap();
        let file_path = tmp_dir.join("roundtrip_test.docx");
        let path_str = file_path.to_string_lossy().to_string();

        compile_docx_to_file(&doc, &style, &path_str).expect("compile failed");

        let mut base = sample_gbt9704_style();
        base.page.margin_top_mm = 20.0;
        base.typography.body.font_zh = "宋体".to_string();
        base.typography.body.size_pt = 12.0;

        let extracted =
            extract_docx_style_profile(&path_str, base).expect("extract_docx_style_profile failed");
        assert!((extracted.profile.page.margin_top_mm - 37.0).abs() < 0.2);
        assert!((extracted.profile.page.margin_left_mm - 28.0).abs() < 0.2);
        assert_eq!(extracted.profile.typography.body.font_zh, "仿宋_GB2312");
        assert!((extracted.profile.typography.body.size_pt - 16.0).abs() < 0.1);
        assert_eq!(extracted.profile.typography.h1.font_zh, "黑体");

        let imported = import_docx_to_ast(&path_str, "gov-gbt9704").expect("import failed");
        assert_eq!(imported.title, "年度工作总结报告");
        assert!(imported.blocks.iter().any(|b| matches!(b, DocBlock::Heading { level: 1, text, .. } if text.contains("工作成效"))));
        assert!(imported.blocks.iter().any(|b| matches!(b, DocBlock::Table { headers, rows, .. } if headers == &vec!["指标", "数值"] && rows.len() == 1)));

        let _ = std::fs::remove_file(&file_path);
    }
}
