use crate::models::{
    DocBlock, DocDocument, HeadingNumbering, StyleProfile, TextRun, TextStyleSpec,
};
use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::Writer;
use std::fs::{self, File};
use std::io::{Cursor, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

const W_NS: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

fn mm_to_twips(mm: f64) -> i64 {
    (mm * 56.6929133858).round() as i64
}

fn pt_to_twips(pt: f64) -> i64 {
    (pt * 20.0).round() as i64
}

fn pt_to_half_pt(pt: f64) -> i64 {
    (pt * 2.0).round() as i64
}

fn pt_to_eighth_pt(pt: f64) -> i64 {
    (pt * 8.0).round() as i64
}

fn clean_hex(hex: &str, fallback: &str) -> String {
    let trimmed = hex.trim().trim_start_matches('#');
    if trimmed.len() == 6 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        trimmed.to_uppercase()
    } else if trimmed.len() == 3 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        trimmed
            .chars()
            .flat_map(|c| [c, c])
            .collect::<String>()
            .to_uppercase()
    } else {
        fallback.to_string()
    }
}

fn has_visible_color(hex: &str) -> bool {
    let t = hex.trim();
    !t.is_empty() && !t.eq_ignore_ascii_case("transparent") && !t.eq_ignore_ascii_case("none")
}

fn map_align(align: &str) -> &'static str {
    match align.to_lowercase().as_str() {
        "center" => "center",
        "right" => "right",
        "justify" | "both" => "both",
        _ => "left",
    }
}

pub fn to_chinese_numeral(num: usize) -> String {
    if num == 0 {
        return "零".to_string();
    }
    const DIGITS: [&str; 10] = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    if num <= 9 {
        return DIGITS[num].to_string();
    }
    if num < 20 {
        return format!("十{}", DIGITS[num - 10]);
    }
    if num < 100 {
        let tens = num / 10;
        let ones = num % 10;
        return format!("{}十{}", DIGITS[tens], DIGITS[ones]);
    }
    if num < 1000 {
        let hundreds = num / 100;
        let rem = num % 100;
        if rem == 0 {
            return format!("{}百", DIGITS[hundreds]);
        }
        let tens = rem / 10;
        let ones = rem % 10;
        if tens == 0 {
            return format!("{}百零{}", DIGITS[hundreds], DIGITS[ones]);
        }
        return format!("{}百{}十{}", DIGITS[hundreds], DIGITS[tens], DIGITS[ones]);
    }
    num.to_string()
}

pub fn format_heading_number(
    level: u8,
    counters: &[usize; 4],
    numbering: &HeadingNumbering,
) -> String {
    if !numbering.enabled {
        return String::new();
    }
    let pattern = match level {
        1 => &numbering.h1_pattern,
        2 => &numbering.h2_pattern,
        3 => &numbering.h3_pattern,
        _ => &numbering.h4_pattern,
    };
    if pattern.trim().is_empty() {
        return String::new();
    }
    let out = pattern
        .replace("{n1}", &counters[0].to_string())
        .replace("{n2}", &counters[1].to_string())
        .replace("{n3}", &counters[2].to_string())
        .replace("{n4}", &counters[3].to_string())
        .replace("{zh1}", &to_chinese_numeral(counters[0]))
        .replace("{zh2}", &to_chinese_numeral(counters[1]))
        .replace("{zh3}", &to_chinese_numeral(counters[2]))
        .replace("{zh4}", &to_chinese_numeral(counters[3]));
    out
}

fn new_writer() -> Writer<Cursor<Vec<u8>>> {
    Writer::new(Cursor::new(Vec::new()))
}

fn finish_writer(writer: Writer<Cursor<Vec<u8>>>) -> Result<Vec<u8>, String> {
    Ok(writer.into_inner().into_inner())
}

fn write_xml_decl(w: &mut Writer<Cursor<Vec<u8>>>) -> Result<(), String> {
    w.write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), Some("yes"))))
        .map_err(|e| e.to_string())
}

fn write_empty(
    w: &mut Writer<Cursor<Vec<u8>>>,
    tag: &str,
    attrs: &[(&str, &str)],
) -> Result<(), String> {
    let mut el = BytesStart::new(tag);
    for (k, v) in attrs {
        el.push_attribute((*k, *v));
    }
    w.write_event(Event::Empty(el)).map_err(|e| e.to_string())
}

fn write_text_el(
    w: &mut Writer<Cursor<Vec<u8>>>,
    tag: &str,
    attrs: &[(&str, &str)],
    text: &str,
) -> Result<(), String> {
    let mut el = BytesStart::new(tag);
    for (k, v) in attrs {
        el.push_attribute((*k, *v));
    }
    w.write_event(Event::Start(el)).map_err(|e| e.to_string())?;
    w.write_event(Event::Text(BytesText::new(text)))
        .map_err(|e| e.to_string())?;
    w.write_event(Event::End(BytesEnd::new(tag)))
        .map_err(|e| e.to_string())
}

fn start_el(
    w: &mut Writer<Cursor<Vec<u8>>>,
    tag: &str,
    attrs: &[(&str, &str)],
) -> Result<(), String> {
    let mut el = BytesStart::new(tag);
    for (k, v) in attrs {
        el.push_attribute((*k, *v));
    }
    w.write_event(Event::Start(el)).map_err(|e| e.to_string())
}

fn end_el(w: &mut Writer<Cursor<Vec<u8>>>, tag: &str) -> Result<(), String> {
    w.write_event(Event::End(BytesEnd::new(tag)))
        .map_err(|e| e.to_string())
}

fn write_rpr_from_spec(
    w: &mut Writer<Cursor<Vec<u8>>>,
    spec: &TextStyleSpec,
    override_bold: Option<bool>,
    override_italic: Option<bool>,
    override_underline: Option<bool>,
    override_color: Option<&str>,
    is_code: bool,
) -> Result<(), String> {
    start_el(w, "w:rPr", &[])?;
    let font_en = if is_code { "Consolas" } else { &spec.font_en };
    let font_zh = if is_code { &spec.font_zh } else { &spec.font_zh };
    write_empty(
        w,
        "w:rFonts",
        &[
            ("w:ascii", font_en),
            ("w:hAnsi", font_en),
            ("w:eastAsia", font_zh),
            ("w:cs", font_en),
        ],
    )?;

    let bold = override_bold.unwrap_or(spec.bold);
    if bold {
        write_empty(w, "w:b", &[])?;
        write_empty(w, "w:bCs", &[])?;
    } else if override_bold == Some(false) {
        write_empty(w, "w:b", &[("w:val", "0")])?;
    }

    let italic = override_italic.unwrap_or(spec.italic);
    if italic {
        write_empty(w, "w:i", &[])?;
        write_empty(w, "w:iCs", &[])?;
    }

    if override_underline == Some(true) {
        write_empty(w, "w:u", &[("w:val", "single")])?;
    }

    let color_hex = override_color
        .map(|c| clean_hex(c, "1E293B"))
        .unwrap_or_else(|| clean_hex(&spec.color, "1E293B"));
    write_empty(w, "w:color", &[("w:val", &color_hex)])?;

    let sz_pt = if is_code {
        (spec.size_pt - 1.0).max(8.5)
    } else {
        spec.size_pt
    };
    let half_pt = pt_to_half_pt(sz_pt).to_string();
    write_empty(w, "w:sz", &[("w:val", &half_pt)])?;
    write_empty(w, "w:szCs", &[("w:val", &half_pt)])?;

    if is_code {
        write_empty(
            w,
            "w:shd",
            &[("w:val", "clear"), ("w:color", "auto"), ("w:fill", "F1F5F9")],
        )?;
    }
    end_el(w, "w:rPr")
}

fn write_ppr_from_spec(
    w: &mut Writer<Cursor<Vec<u8>>>,
    spec: &TextStyleSpec,
    style_id: Option<&str>,
    override_indent: Option<bool>,
    override_align: Option<&str>,
) -> Result<(), String> {
    start_el(w, "w:pPr", &[])?;
    if let Some(sid) = style_id {
        write_empty(w, "w:pStyle", &[("w:val", sid)])?;
    }
    if spec.keep_with_next.unwrap_or(false) {
        write_empty(w, "w:keepNext", &[])?;
        write_empty(w, "w:keepLines", &[])?;
    }

    if spec.border_bottom.unwrap_or(false) {
        start_el(w, "w:pBdr", &[])?;
        write_empty(
            w,
            "w:bottom",
            &[
                ("w:val", "single"),
                ("w:sz", "6"),
                ("w:space", "4"),
                ("w:color", "CBD5E1"),
            ],
        )?;
        end_el(w, "w:pBdr")?;
    }

    if let Some(bg) = &spec.background_color {
        if has_visible_color(bg) {
            let fill = clean_hex(bg, "F8FAFC");
            write_empty(
                w,
                "w:shd",
                &[("w:val", "clear"), ("w:color", "auto"), ("w:fill", &fill)],
            )?;
        }
    }

    let before = pt_to_twips(spec.space_before_pt).to_string();
    let after = pt_to_twips(spec.space_after_pt).to_string();
    if spec.line_spacing_rule == "exact" {
        let line = pt_to_twips(spec.line_spacing_value).to_string();
        write_empty(
            w,
            "w:spacing",
            &[
                ("w:before", &before),
                ("w:after", &after),
                ("w:line", &line),
                ("w:lineRule", "exact"),
            ],
        )?;
    } else {
        let line = (spec.line_spacing_value * 240.0).round() as i64;
        let line_str = line.max(240).to_string();
        write_empty(
            w,
            "w:spacing",
            &[
                ("w:before", &before),
                ("w:after", &after),
                ("w:line", &line_str),
                ("w:lineRule", "auto"),
            ],
        )?;
    }

    let effective_indent = match override_indent {
        Some(false) => 0.0,
        Some(true) => {
            if spec.first_line_indent_chars > 0.0 {
                spec.first_line_indent_chars
            } else {
                2.0
            }
        }
        None => spec.first_line_indent_chars,
    };
    if effective_indent > 0.0 {
        let chars_val = (effective_indent * 100.0).round() as i64;
        let twips_val = pt_to_twips(effective_indent * spec.size_pt);
        let chars_s = chars_val.to_string();
        let twips_s = twips_val.to_string();
        write_empty(
            w,
            "w:ind",
            &[("w:firstLineChars", &chars_s), ("w:firstLine", &twips_s)],
        )?;
    } else if override_indent == Some(false) {
        write_empty(
            w,
            "w:ind",
            &[("w:firstLineChars", "0"), ("w:firstLine", "0")],
        )?;
    }

    let jc = map_align(override_align.unwrap_or(&spec.align));
    write_empty(w, "w:jc", &[("w:val", jc)])?;
    end_el(w, "w:pPr")
}

fn write_run(
    w: &mut Writer<Cursor<Vec<u8>>>,
    spec: &TextStyleSpec,
    run: &TextRun,
) -> Result<(), String> {
    start_el(w, "w:r", &[])?;
    write_rpr_from_spec(
        w,
        spec,
        run.bold,
        run.italic,
        run.underline,
        run.color.as_deref(),
        run.code.unwrap_or(false),
    )?;
    // Handle embedded newlines cleanly as <w:br/>
    let parts: Vec<&str> = run.text.split('\n').collect();
    for (idx, part) in parts.iter().enumerate() {
        if idx > 0 {
            write_empty(w, "w:br", &[])?;
        }
        write_text_el(w, "w:t", &[("xml:space", "preserve")], part)?;
    }
    end_el(w, "w:r")
}

fn build_content_types() -> Result<Vec<u8>, String> {
    let mut w = new_writer();
    write_xml_decl(&mut w)?;
    start_el(
        &mut w,
        "Types",
        &[(
            "xmlns",
            "http://schemas.openxmlformats.org/package/2006/content-types",
        )],
    )?;
    write_empty(
        &mut w,
        "Default",
        &[
            ("Extension", "rels"),
            (
                "ContentType",
                "application/vnd.openxmlformats-package.relationships+xml",
            ),
        ],
    )?;
    write_empty(
        &mut w,
        "Default",
        &[("Extension", "xml"), ("ContentType", "application/xml")],
    )?;
    write_empty(
        &mut w,
        "Override",
        &[
            ("PartName", "/word/document.xml"),
            (
                "ContentType",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
            ),
        ],
    )?;
    write_empty(
        &mut w,
        "Override",
        &[
            ("PartName", "/word/styles.xml"),
            (
                "ContentType",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
            ),
        ],
    )?;
    write_empty(
        &mut w,
        "Override",
        &[
            ("PartName", "/word/numbering.xml"),
            (
                "ContentType",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
            ),
        ],
    )?;
    write_empty(
        &mut w,
        "Override",
        &[
            ("PartName", "/word/header1.xml"),
            (
                "ContentType",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
            ),
        ],
    )?;
    write_empty(
        &mut w,
        "Override",
        &[
            ("PartName", "/word/footer1.xml"),
            (
                "ContentType",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
            ),
        ],
    )?;
    end_el(&mut w, "Types")?;
    finish_writer(w)
}

fn build_root_rels() -> Result<Vec<u8>, String> {
    let mut w = new_writer();
    write_xml_decl(&mut w)?;
    start_el(
        &mut w,
        "Relationships",
        &[(
            "xmlns",
            "http://schemas.openxmlformats.org/package/2006/relationships",
        )],
    )?;
    write_empty(
        &mut w,
        "Relationship",
        &[
            ("Id", "rId1"),
            (
                "Type",
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
            ),
            ("Target", "word/document.xml"),
        ],
    )?;
    end_el(&mut w, "Relationships")?;
    finish_writer(w)
}

fn build_document_rels() -> Result<Vec<u8>, String> {
    let mut w = new_writer();
    write_xml_decl(&mut w)?;
    start_el(
        &mut w,
        "Relationships",
        &[(
            "xmlns",
            "http://schemas.openxmlformats.org/package/2006/relationships",
        )],
    )?;
    write_empty(
        &mut w,
        "Relationship",
        &[
            ("Id", "rId1"),
            (
                "Type",
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
            ),
            ("Target", "styles.xml"),
        ],
    )?;
    write_empty(
        &mut w,
        "Relationship",
        &[
            ("Id", "rId2"),
            (
                "Type",
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
            ),
            ("Target", "numbering.xml"),
        ],
    )?;
    write_empty(
        &mut w,
        "Relationship",
        &[
            ("Id", "rId3"),
            (
                "Type",
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
            ),
            ("Target", "header1.xml"),
        ],
    )?;
    write_empty(
        &mut w,
        "Relationship",
        &[
            ("Id", "rId4"),
            (
                "Type",
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
            ),
            ("Target", "footer1.xml"),
        ],
    )?;
    end_el(&mut w, "Relationships")?;
    finish_writer(w)
}

fn write_style_definition(
    w: &mut Writer<Cursor<Vec<u8>>>,
    style_id: &str,
    name: &str,
    is_default: bool,
    based_on: Option<&str>,
    outline_lvl: Option<u8>,
    spec: &TextStyleSpec,
) -> Result<(), String> {
    let mut attrs = vec![("w:type", "paragraph"), ("w:styleId", style_id)];
    if is_default {
        attrs.push(("w:default", "1"));
    }
    start_el(w, "w:style", &attrs)?;
    write_empty(w, "w:name", &[("w:val", name)])?;
    if let Some(base) = based_on {
        write_empty(w, "w:basedOn", &[("w:val", base)])?;
    }
    if outline_lvl.is_some() {
        write_empty(w, "w:next", &[("w:val", "Normal")])?;
    }
    write_empty(w, "w:qFormat", &[])?;

    start_el(w, "w:pPr", &[])?;
    if let Some(lvl) = outline_lvl {
        let lvl_str = lvl.to_string();
        write_empty(w, "w:outlineLvl", &[("w:val", &lvl_str)])?;
    }
    if spec.keep_with_next.unwrap_or(false) {
        write_empty(w, "w:keepNext", &[])?;
        write_empty(w, "w:keepLines", &[])?;
    }
    let before = pt_to_twips(spec.space_before_pt).to_string();
    let after = pt_to_twips(spec.space_after_pt).to_string();
    if spec.line_spacing_rule == "exact" {
        let line = pt_to_twips(spec.line_spacing_value).to_string();
        write_empty(
            w,
            "w:spacing",
            &[
                ("w:before", &before),
                ("w:after", &after),
                ("w:line", &line),
                ("w:lineRule", "exact"),
            ],
        )?;
    } else {
        let line = ((spec.line_spacing_value * 240.0).round() as i64)
            .max(240)
            .to_string();
        write_empty(
            w,
            "w:spacing",
            &[
                ("w:before", &before),
                ("w:after", &after),
                ("w:line", &line),
                ("w:lineRule", "auto"),
            ],
        )?;
    }
    if spec.first_line_indent_chars > 0.0 {
        let chars_val = ((spec.first_line_indent_chars * 100.0).round() as i64).to_string();
        let twips_val = pt_to_twips(spec.first_line_indent_chars * spec.size_pt).to_string();
        write_empty(
            w,
            "w:ind",
            &[("w:firstLineChars", &chars_val), ("w:firstLine", &twips_val)],
        )?;
    }
    write_empty(w, "w:jc", &[("w:val", map_align(&spec.align))])?;
    end_el(w, "w:pPr")?;

    write_rpr_from_spec(w, spec, None, None, None, None, false)?;
    end_el(w, "w:style")
}

fn build_styles_xml(style: &StyleProfile) -> Result<Vec<u8>, String> {
    let mut w = new_writer();
    write_xml_decl(&mut w)?;
    start_el(&mut w, "w:styles", &[("xmlns:w", W_NS)])?;

    // DocDefaults
    start_el(&mut w, "w:docDefaults", &[])?;
    start_el(&mut w, "w:rPrDefault", &[])?;
    write_rpr_from_spec(&mut w, &style.typography.body, None, None, None, None, false)?;
    end_el(&mut w, "w:rPrDefault")?;
    start_el(&mut w, "w:pPrDefault", &[])?;
    start_el(&mut w, "w:pPr", &[])?;
    write_empty(
        &mut w,
        "w:spacing",
        &[("w:after", "0"), ("w:line", "240"), ("w:lineRule", "auto")],
    )?;
    end_el(&mut w, "w:pPr")?;
    end_el(&mut w, "w:pPrDefault")?;
    end_el(&mut w, "w:docDefaults")?;

    write_style_definition(
        &mut w,
        "Normal",
        "Normal",
        true,
        None,
        None,
        &style.typography.body,
    )?;
    write_style_definition(
        &mut w,
        "OneDocTitle",
        "Title",
        false,
        Some("Normal"),
        None,
        &style.typography.title,
    )?;
    write_style_definition(
        &mut w,
        "OneDocSubtitle",
        "Subtitle",
        false,
        Some("Normal"),
        None,
        &style.typography.subtitle,
    )?;
    write_style_definition(
        &mut w,
        "Heading1",
        "heading 1",
        false,
        Some("Normal"),
        Some(0),
        &style.typography.h1,
    )?;
    write_style_definition(
        &mut w,
        "Heading2",
        "heading 2",
        false,
        Some("Normal"),
        Some(1),
        &style.typography.h2,
    )?;
    write_style_definition(
        &mut w,
        "Heading3",
        "heading 3",
        false,
        Some("Normal"),
        Some(2),
        &style.typography.h3,
    )?;
    write_style_definition(
        &mut w,
        "Heading4",
        "heading 4",
        false,
        Some("Normal"),
        Some(3),
        &style.typography.h4,
    )?;
    write_style_definition(
        &mut w,
        "OneDocQuote",
        "Quote",
        false,
        Some("Normal"),
        None,
        &style.typography.quote,
    )?;
    write_style_definition(
        &mut w,
        "OneDocCaption",
        "Caption",
        false,
        Some("Normal"),
        None,
        &style.typography.caption,
    )?;

    end_el(&mut w, "w:styles")?;
    finish_writer(w)
}

fn build_numbering_xml(body: &TextStyleSpec) -> Result<Vec<u8>, String> {
    let mut w = new_writer();
    write_xml_decl(&mut w)?;
    start_el(&mut w, "w:numbering", &[("xmlns:w", W_NS)])?;

    // abstractNum 0: bullet list
    start_el(&mut w, "w:abstractNum", &[("w:abstractNumId", "0")])?;
    write_empty(&mut w, "w:multiLevelType", &[("w:val", "singleLevel")])?;
    start_el(&mut w, "w:lvl", &[("w:ilvl", "0")])?;
    write_empty(&mut w, "w:start", &[("w:val", "1")])?;
    write_empty(&mut w, "w:numFmt", &[("w:val", "bullet")])?;
    write_empty(&mut w, "w:lvlText", &[("w:val", "•")])?;
    write_empty(&mut w, "w:lvlJc", &[("w:val", "left")])?;
    start_el(&mut w, "w:pPr", &[])?;
    write_empty(
        &mut w,
        "w:ind",
        &[("w:left", "420"), ("w:hanging", "260")],
    )?;
    end_el(&mut w, "w:pPr")?;
    start_el(&mut w, "w:rPr", &[])?;
    write_empty(
        &mut w,
        "w:rFonts",
        &[
            ("w:ascii", &body.font_en),
            ("w:hAnsi", &body.font_en),
            ("w:eastAsia", &body.font_zh),
            ("w:hint", "default"),
        ],
    )?;
    end_el(&mut w, "w:rPr")?;
    end_el(&mut w, "w:lvl")?;
    end_el(&mut w, "w:abstractNum")?;

    // abstractNum 1: decimal list
    start_el(&mut w, "w:abstractNum", &[("w:abstractNumId", "1")])?;
    write_empty(&mut w, "w:multiLevelType", &[("w:val", "singleLevel")])?;
    start_el(&mut w, "w:lvl", &[("w:ilvl", "0")])?;
    write_empty(&mut w, "w:start", &[("w:val", "1")])?;
    write_empty(&mut w, "w:numFmt", &[("w:val", "decimal")])?;
    write_empty(&mut w, "w:lvlText", &[("w:val", "%1.")])?;
    write_empty(&mut w, "w:lvlJc", &[("w:val", "left")])?;
    start_el(&mut w, "w:pPr", &[])?;
    write_empty(
        &mut w,
        "w:ind",
        &[("w:left", "420"), ("w:hanging", "280")],
    )?;
    end_el(&mut w, "w:pPr")?;
    end_el(&mut w, "w:lvl")?;
    end_el(&mut w, "w:abstractNum")?;

    // Concrete num instances
    start_el(&mut w, "w:num", &[("w:numId", "1")])?;
    write_empty(&mut w, "w:abstractNumId", &[("w:val", "0")])?;
    end_el(&mut w, "w:num")?;

    start_el(&mut w, "w:num", &[("w:numId", "2")])?;
    write_empty(&mut w, "w:abstractNumId", &[("w:val", "1")])?;
    end_el(&mut w, "w:num")?;

    end_el(&mut w, "w:numbering")?;
    finish_writer(w)
}

fn build_header_xml(style: &StyleProfile) -> Result<Vec<u8>, String> {
    let mut w = new_writer();
    write_xml_decl(&mut w)?;
    start_el(&mut w, "w:hdr", &[("xmlns:w", W_NS)])?;

    let hf = &style.header_footer;
    if hf.show_header && !hf.header_text.trim().is_empty() {
        start_el(&mut w, "w:p", &[])?;
        start_el(&mut w, "w:pPr", &[])?;
        if hf.header_border_bottom {
            start_el(&mut w, "w:pBdr", &[])?;
            let b_color = clean_hex(&style.colors.border, "CBD5E1");
            write_empty(
                &mut w,
                "w:bottom",
                &[
                    ("w:val", "single"),
                    ("w:sz", "4"),
                    ("w:space", "4"),
                    ("w:color", &b_color),
                ],
            )?;
            end_el(&mut w, "w:pBdr")?;
        }
        write_empty(&mut w, "w:jc", &[("w:val", "right")])?;
        end_el(&mut w, "w:pPr")?;

        start_el(&mut w, "w:r", &[])?;
        start_el(&mut w, "w:rPr", &[])?;
        write_empty(
            &mut w,
            "w:rFonts",
            &[
                ("w:ascii", &style.typography.body.font_en),
                ("w:hAnsi", &style.typography.body.font_en),
                ("w:eastAsia", &style.typography.body.font_zh),
            ],
        )?;
        let color = clean_hex(&style.colors.muted, "64748B");
        write_empty(&mut w, "w:color", &[("w:val", &color)])?;
        write_empty(&mut w, "w:sz", &[("w:val", "18")])?;
        write_empty(&mut w, "w:szCs", &[("w:val", "18")])?;
        end_el(&mut w, "w:rPr")?;
        write_text_el(&mut w, "w:t", &[("xml:space", "preserve")], &hf.header_text)?;
        end_el(&mut w, "w:r")?;
        end_el(&mut w, "w:p")?;
    } else {
        start_el(&mut w, "w:p", &[])?;
        end_el(&mut w, "w:p")?;
    }

    end_el(&mut w, "w:hdr")?;
    finish_writer(w)
}

fn write_field_code(
    w: &mut Writer<Cursor<Vec<u8>>>,
    instr: &str,
    placeholder: &str,
    font_zh: &str,
    font_en: &str,
    color: &str,
) -> Result<(), String> {
    let write_rpr = |w: &mut Writer<Cursor<Vec<u8>>>| -> Result<(), String> {
        start_el(w, "w:rPr", &[])?;
        write_empty(
            w,
            "w:rFonts",
            &[
                ("w:ascii", font_en),
                ("w:hAnsi", font_en),
                ("w:eastAsia", font_zh),
            ],
        )?;
        write_empty(w, "w:color", &[("w:val", color)])?;
        write_empty(w, "w:sz", &[("w:val", "18")])?;
        write_empty(w, "w:szCs", &[("w:val", "18")])?;
        end_el(w, "w:rPr")
    };

    start_el(w, "w:r", &[])?;
    write_rpr(w)?;
    write_empty(w, "w:fldChar", &[("w:fldCharType", "begin")])?;
    end_el(w, "w:r")?;

    start_el(w, "w:r", &[])?;
    write_rpr(w)?;
    write_text_el(w, "w:instrText", &[("xml:space", "preserve")], instr)?;
    end_el(w, "w:r")?;

    start_el(w, "w:r", &[])?;
    write_rpr(w)?;
    write_empty(w, "w:fldChar", &[("w:fldCharType", "separate")])?;
    end_el(w, "w:r")?;

    start_el(w, "w:r", &[])?;
    write_rpr(w)?;
    write_text_el(w, "w:t", &[], placeholder)?;
    end_el(w, "w:r")?;

    start_el(w, "w:r", &[])?;
    write_rpr(w)?;
    write_empty(w, "w:fldChar", &[("w:fldCharType", "end")])?;
    end_el(w, "w:r")
}

fn write_footer_text_run(
    w: &mut Writer<Cursor<Vec<u8>>>,
    text: &str,
    font_zh: &str,
    font_en: &str,
    color: &str,
) -> Result<(), String> {
    start_el(w, "w:r", &[])?;
    start_el(w, "w:rPr", &[])?;
    write_empty(
        w,
        "w:rFonts",
        &[
            ("w:ascii", font_en),
            ("w:hAnsi", font_en),
            ("w:eastAsia", font_zh),
        ],
    )?;
    write_empty(w, "w:color", &[("w:val", color)])?;
    write_empty(w, "w:sz", &[("w:val", "18")])?;
    write_empty(w, "w:szCs", &[("w:val", "18")])?;
    end_el(w, "w:rPr")?;
    write_text_el(w, "w:t", &[("xml:space", "preserve")], text)?;
    end_el(w, "w:r")
}

fn build_footer_xml(style: &StyleProfile) -> Result<Vec<u8>, String> {
    let mut w = new_writer();
    write_xml_decl(&mut w)?;
    start_el(&mut w, "w:ftr", &[("xmlns:w", W_NS)])?;

    let hf = &style.header_footer;
    let font_zh = &style.typography.body.font_zh;
    let font_en = &style.typography.body.font_en;
    let color = clean_hex(&style.colors.muted, "64748B");

    if hf.show_footer && (hf.show_page_number || !hf.footer_text.trim().is_empty()) {
        start_el(&mut w, "w:p", &[])?;
        start_el(&mut w, "w:pPr", &[])?;
        write_empty(
            &mut w,
            "w:jc",
            &[("w:val", map_align(&hf.page_number_align))],
        )?;
        end_el(&mut w, "w:pPr")?;

        if !hf.footer_text.trim().is_empty() {
            write_footer_text_run(&mut w, &hf.footer_text, font_zh, font_en, &color)?;
            if hf.show_page_number {
                write_footer_text_run(&mut w, "    ", font_zh, font_en, &color)?;
            }
        }

        if hf.show_page_number {
            match hf.page_number_format.as_str() {
                "dash" => {
                    write_footer_text_run(&mut w, "— ", font_zh, font_en, &color)?;
                    write_field_code(&mut w, " PAGE ", "1", font_zh, font_en, &color)?;
                    write_footer_text_run(&mut w, " —", font_zh, font_en, &color)?;
                }
                "of_total" => {
                    write_field_code(&mut w, " PAGE ", "1", font_zh, font_en, &color)?;
                    write_footer_text_run(&mut w, " / ", font_zh, font_en, &color)?;
                    write_field_code(&mut w, " NUMPAGES ", "1", font_zh, font_en, &color)?;
                }
                _ => {
                    write_field_code(&mut w, " PAGE ", "1", font_zh, font_en, &color)?;
                }
            }
        }
        end_el(&mut w, "w:p")?;
    } else {
        start_el(&mut w, "w:p", &[])?;
        end_el(&mut w, "w:p")?;
    }

    end_el(&mut w, "w:ftr")?;
    finish_writer(w)
}

fn write_table_block(
    w: &mut Writer<Cursor<Vec<u8>>>,
    style: &StyleProfile,
    caption: Option<&str>,
    headers: &[String],
    rows: &[Vec<String>],
) -> Result<(), String> {
    if let Some(cap) = caption {
        if !cap.trim().is_empty() {
            start_el(w, "w:p", &[])?;
            write_ppr_from_spec(w, &style.typography.caption, Some("OneDocCaption"), None, None)?;
            write_run(w, &style.typography.caption, &TextRun::plain(cap))?;
            end_el(w, "w:p")?;
        }
    }

    let col_count = headers
        .len()
        .max(rows.iter().map(|r| r.len()).max().unwrap_or(1))
        .max(1);
    let content_twips = (mm_to_twips(style.page.width_mm)
        - mm_to_twips(style.page.margin_left_mm)
        - mm_to_twips(style.page.margin_right_mm))
    .max(2000);
    let col_w = content_twips / col_count as i64;
    let total_w_str = content_twips.to_string();
    let col_w_str = col_w.to_string();

    let tbl_spec = &style.table;
    let border_hex = clean_hex(&tbl_spec.border_color, "CBD5E1");
    let mode = tbl_spec.style.as_str();

    start_el(w, "w:tbl", &[])?;
    start_el(w, "w:tblPr", &[])?;
    write_empty(
        w,
        "w:tblW",
        &[("w:w", &total_w_str), ("w:type", "dxa")],
    )?;
    write_empty(w, "w:jc", &[("w:val", "center")])?;

    // Table borders
    start_el(w, "w:tblBorders", &[])?;
    match mode {
        "three_line" => {
            write_empty(
                w,
                "w:top",
                &[
                    ("w:val", "single"),
                    ("w:sz", "12"),
                    ("w:space", "0"),
                    ("w:color", &border_hex),
                ],
            )?;
            write_empty(w, "w:left", &[("w:val", "none")])?;
            write_empty(
                w,
                "w:bottom",
                &[
                    ("w:val", "single"),
                    ("w:sz", "12"),
                    ("w:space", "0"),
                    ("w:color", &border_hex),
                ],
            )?;
            write_empty(w, "w:right", &[("w:val", "none")])?;
            write_empty(w, "w:insideH", &[("w:val", "none")])?;
            write_empty(w, "w:insideV", &[("w:val", "none")])?;
        }
        "zebra" => {
            write_empty(
                w,
                "w:top",
                &[
                    ("w:val", "single"),
                    ("w:sz", "6"),
                    ("w:space", "0"),
                    ("w:color", &border_hex),
                ],
            )?;
            write_empty(w, "w:left", &[("w:val", "none")])?;
            write_empty(
                w,
                "w:bottom",
                &[
                    ("w:val", "single"),
                    ("w:sz", "6"),
                    ("w:space", "0"),
                    ("w:color", &border_hex),
                ],
            )?;
            write_empty(w, "w:right", &[("w:val", "none")])?;
            write_empty(
                w,
                "w:insideH",
                &[
                    ("w:val", "single"),
                    ("w:sz", "4"),
                    ("w:space", "0"),
                    ("w:color", &border_hex),
                ],
            )?;
            write_empty(w, "w:insideV", &[("w:val", "none")])?;
        }
        _ => {
            // grid
            for edge in ["w:top", "w:left", "w:bottom", "w:right", "w:insideH", "w:insideV"] {
                write_empty(
                    w,
                    edge,
                    &[
                        ("w:val", "single"),
                        ("w:sz", "4"),
                        ("w:space", "0"),
                        ("w:color", &border_hex),
                    ],
                )?;
            }
        }
    }
    end_el(w, "w:tblBorders")?;

    // Cell padding
    let pad_v = pt_to_twips(tbl_spec.cell_padding_pt.max(2.0)).to_string();
    let pad_h = pt_to_twips((tbl_spec.cell_padding_pt * 1.4).max(5.0)).to_string();
    start_el(w, "w:tblCellMar", &[])?;
    write_empty(w, "w:top", &[("w:w", &pad_v), ("w:type", "dxa")])?;
    write_empty(w, "w:left", &[("w:w", &pad_h), ("w:type", "dxa")])?;
    write_empty(w, "w:bottom", &[("w:w", &pad_v), ("w:type", "dxa")])?;
    write_empty(w, "w:right", &[("w:w", &pad_h), ("w:type", "dxa")])?;
    end_el(w, "w:tblCellMar")?;
    end_el(w, "w:tblPr")?;

    // tblGrid
    start_el(w, "w:tblGrid", &[])?;
    for _ in 0..col_count {
        write_empty(w, "w:gridCol", &[("w:w", &col_w_str)])?;
    }
    end_el(w, "w:tblGrid")?;

    // Header row
    if !headers.is_empty() {
        start_el(w, "w:tr", &[])?;
        start_el(w, "w:trPr", &[])?;
        write_empty(w, "w:cantSplit", &[])?;
        if tbl_spec.repeat_header {
            write_empty(w, "w:tblHeader", &[])?;
        }
        end_el(w, "w:trPr")?;

        let header_spec = &style.typography.table_header;
        for c in 0..col_count {
            let cell_text = headers.get(c).map(|s| s.as_str()).unwrap_or("");
            start_el(w, "w:tc", &[])?;
            start_el(w, "w:tcPr", &[])?;
            write_empty(w, "w:tcW", &[("w:w", &col_w_str), ("w:type", "dxa")])?;
            if mode == "three_line" {
                start_el(w, "w:tcBorders", &[])?;
                write_empty(
                    w,
                    "w:bottom",
                    &[
                        ("w:val", "single"),
                        ("w:sz", "6"),
                        ("w:space", "0"),
                        ("w:color", &border_hex),
                    ],
                )?;
                end_el(w, "w:tcBorders")?;
            }
            if has_visible_color(&tbl_spec.header_bg) && mode != "three_line" {
                let fill = clean_hex(&tbl_spec.header_bg, "1E3A8A");
                write_empty(
                    w,
                    "w:shd",
                    &[("w:val", "clear"), ("w:color", "auto"), ("w:fill", &fill)],
                )?;
            }
            write_empty(w, "w:vAlign", &[("w:val", "center")])?;
            end_el(w, "w:tcPr")?;

            start_el(w, "w:p", &[])?;
            write_ppr_from_spec(w, header_spec, None, Some(false), None)?;
            let mut run = TextRun::plain(cell_text);
            if mode != "three_line" && has_visible_color(&tbl_spec.header_text_color) {
                run.color = Some(tbl_spec.header_text_color.clone());
            }
            write_run(w, header_spec, &run)?;
            end_el(w, "w:p")?;
            end_el(w, "w:tc")?;
        }
        end_el(w, "w:tr")?;
    }

    // Body rows
    let cell_spec = &style.typography.table_cell;
    for (row_idx, row) in rows.iter().enumerate() {
        start_el(w, "w:tr", &[])?;
        start_el(w, "w:trPr", &[])?;
        write_empty(w, "w:cantSplit", &[])?;
        end_el(w, "w:trPr")?;

        let apply_zebra =
            mode == "zebra" && row_idx % 2 == 1 && has_visible_color(&tbl_spec.zebra_bg);
        for c in 0..col_count {
            let cell_text = row.get(c).map(|s| s.as_str()).unwrap_or("");
            start_el(w, "w:tc", &[])?;
            start_el(w, "w:tcPr", &[])?;
            write_empty(w, "w:tcW", &[("w:w", &col_w_str), ("w:type", "dxa")])?;
            if apply_zebra {
                let fill = clean_hex(&tbl_spec.zebra_bg, "F8FAFC");
                write_empty(
                    w,
                    "w:shd",
                    &[("w:val", "clear"), ("w:color", "auto"), ("w:fill", &fill)],
                )?;
            }
            write_empty(w, "w:vAlign", &[("w:val", "center")])?;
            end_el(w, "w:tcPr")?;

            start_el(w, "w:p", &[])?;
            write_ppr_from_spec(w, cell_spec, None, Some(false), None)?;
            write_run(w, cell_spec, &TextRun::plain(cell_text))?;
            end_el(w, "w:p")?;
            end_el(w, "w:tc")?;
        }
        end_el(w, "w:tr")?;
    }

    end_el(w, "w:tbl")?;
    // Spacing paragraph after table so consecutive tables never merge
    start_el(w, "w:p", &[])?;
    start_el(w, "w:pPr", &[])?;
    write_empty(
        w,
        "w:spacing",
        &[("w:before", "0"), ("w:after", "120"), ("w:line", "240")],
    )?;
    end_el(w, "w:pPr")?;
    end_el(w, "w:p")
}

fn build_document_xml(doc: &DocDocument, style: &StyleProfile) -> Result<Vec<u8>, String> {
    let mut w = new_writer();
    write_xml_decl(&mut w)?;
    start_el(
        &mut w,
        "w:document",
        &[("xmlns:w", W_NS), ("xmlns:r", R_NS)],
    )?;
    start_el(&mut w, "w:body", &[])?;

    let mut counters = [0usize; 4];

    for block in &doc.blocks {
        match block {
            DocBlock::Title { text, .. } => {
                start_el(&mut w, "w:p", &[])?;
                write_ppr_from_spec(
                    &mut w,
                    &style.typography.title,
                    Some("OneDocTitle"),
                    Some(false),
                    None,
                )?;
                write_run(&mut w, &style.typography.title, &TextRun::plain(text))?;
                end_el(&mut w, "w:p")?;
            }
            DocBlock::Subtitle { text, .. } => {
                start_el(&mut w, "w:p", &[])?;
                write_ppr_from_spec(
                    &mut w,
                    &style.typography.subtitle,
                    Some("OneDocSubtitle"),
                    Some(false),
                    None,
                )?;
                write_run(&mut w, &style.typography.subtitle, &TextRun::plain(text))?;
                end_el(&mut w, "w:p")?;
            }
            DocBlock::Heading { level, text, .. } => {
                let lvl = (*level).clamp(1, 4);
                let idx = (lvl - 1) as usize;
                counters[idx] += 1;
                for j in (idx + 1)..4 {
                    counters[j] = 0;
                }
                let prefix = format_heading_number(lvl, &counters, &style.numbering);
                let display_text = if !prefix.is_empty() && !text.starts_with(prefix.trim()) {
                    format!("{}{}", prefix, text)
                } else {
                    text.clone()
                };

                let (style_id, spec) = match lvl {
                    1 => ("Heading1", &style.typography.h1),
                    2 => ("Heading2", &style.typography.h2),
                    3 => ("Heading3", &style.typography.h3),
                    _ => ("Heading4", &style.typography.h4),
                };

                start_el(&mut w, "w:p", &[])?;
                write_ppr_from_spec(&mut w, spec, Some(style_id), Some(false), None)?;
                write_run(&mut w, spec, &TextRun::plain(&display_text))?;
                end_el(&mut w, "w:p")?;
            }
            DocBlock::Paragraph {
                runs,
                indent,
                align,
                ..
            } => {
                start_el(&mut w, "w:p", &[])?;
                write_ppr_from_spec(
                    &mut w,
                    &style.typography.body,
                    Some("Normal"),
                    *indent,
                    align.as_deref(),
                )?;
                if runs.is_empty() {
                    write_run(&mut w, &style.typography.body, &TextRun::plain(""))?;
                } else {
                    for r in runs {
                        write_run(&mut w, &style.typography.body, r)?;
                    }
                }
                end_el(&mut w, "w:p")?;
            }
            DocBlock::List { ordered, items, .. } => {
                let num_id = if *ordered { "2" } else { "1" };
                for item_runs in items {
                    start_el(&mut w, "w:p", &[])?;
                    start_el(&mut w, "w:pPr", &[])?;
                    write_empty(&mut w, "w:pStyle", &[("w:val", "Normal")])?;
                    start_el(&mut w, "w:numPr", &[])?;
                    write_empty(&mut w, "w:ilvl", &[("w:val", "0")])?;
                    write_empty(&mut w, "w:numId", &[("w:val", num_id)])?;
                    end_el(&mut w, "w:numPr")?;
                    write_empty(
                        &mut w,
                        "w:spacing",
                        &[("w:before", "40"), ("w:after", "80"), ("w:line", "320")],
                    )?;
                    end_el(&mut w, "w:pPr")?;

                    for r in item_runs {
                        write_run(&mut w, &style.typography.body, r)?;
                    }
                    end_el(&mut w, "w:p")?;
                }
            }
            DocBlock::Quote { title, text, .. } => {
                let qspec = &style.typography.quote;
                let border_hex = clean_hex(&style.colors.primary, "2563EB");
                let fill_hex = qspec
                    .background_color
                    .as_deref()
                    .filter(|c| has_visible_color(c))
                    .map(|c| clean_hex(c, "EFF6FF"))
                    .unwrap_or_else(|| clean_hex(&style.colors.callout_bg, "F1F5F9"));

                start_el(&mut w, "w:p", &[])?;
                start_el(&mut w, "w:pPr", &[])?;
                write_empty(&mut w, "w:pStyle", &[("w:val", "OneDocQuote")])?;
                start_el(&mut w, "w:pBdr", &[])?;
                write_empty(
                    &mut w,
                    "w:left",
                    &[
                        ("w:val", "single"),
                        ("w:sz", "24"),
                        ("w:space", "10"),
                        ("w:color", &border_hex),
                    ],
                )?;
                end_el(&mut w, "w:pBdr")?;
                write_empty(
                    &mut w,
                    "w:shd",
                    &[
                        ("w:val", "clear"),
                        ("w:color", "auto"),
                        ("w:fill", &fill_hex),
                    ],
                )?;
                write_empty(&mut w, "w:ind", &[("w:left", "280"), ("w:right", "180")])?;
                write_empty(
                    &mut w,
                    "w:spacing",
                    &[("w:before", "120"), ("w:after", "140"), ("w:line", "320")],
                )?;
                end_el(&mut w, "w:pPr")?;

                if let Some(t) = title {
                    if !t.trim().is_empty() {
                        let mut title_run = TextRun::plain(format!("{}\n", t));
                        title_run.bold = Some(true);
                        title_run.color = Some(style.colors.primary.clone());
                        write_run(&mut w, qspec, &title_run)?;
                    }
                }
                write_run(&mut w, qspec, &TextRun::plain(text))?;
                end_el(&mut w, "w:p")?;
            }
            DocBlock::CodeBlock { code, .. } => {
                start_el(&mut w, "w:p", &[])?;
                start_el(&mut w, "w:pPr", &[])?;
                start_el(&mut w, "w:pBdr", &[])?;
                for edge in ["w:top", "w:left", "w:bottom", "w:right"] {
                    write_empty(
                        &mut w,
                        edge,
                        &[
                            ("w:val", "single"),
                            ("w:sz", "4"),
                            ("w:space", "6"),
                            ("w:color", "E2E8F0"),
                        ],
                    )?;
                }
                end_el(&mut w, "w:pBdr")?;
                write_empty(
                    &mut w,
                    "w:shd",
                    &[("w:val", "clear"), ("w:color", "auto"), ("w:fill", "F8FAFC")],
                )?;
                write_empty(&mut w, "w:ind", &[("w:left", "180"), ("w:right", "180")])?;
                write_empty(
                    &mut w,
                    "w:spacing",
                    &[("w:before", "100"), ("w:after", "140"), ("w:line", "270")],
                )?;
                end_el(&mut w, "w:pPr")?;

                let mut code_spec = style.typography.body.clone();
                code_spec.font_en = "Consolas".to_string();
                code_spec.size_pt = 9.5;
                code_spec.color = "#1E293B".to_string();
                code_spec.bold = false;
                write_run(&mut w, &code_spec, &TextRun::plain(code))?;
                end_el(&mut w, "w:p")?;
            }
            DocBlock::Table {
                caption,
                headers,
                rows,
                ..
            } => {
                write_table_block(
                    &mut w,
                    style,
                    caption.as_deref(),
                    headers,
                    rows,
                )?;
            }
            DocBlock::Divider { style: div_style, .. } => {
                let is_red = div_style.as_deref() == Some("double_red");
                start_el(&mut w, "w:p", &[])?;
                start_el(&mut w, "w:pPr", &[])?;
                start_el(&mut w, "w:pBdr", &[])?;
                if is_red {
                    write_empty(
                        &mut w,
                        "w:bottom",
                        &[
                            ("w:val", "thickThinSmallGap"),
                            ("w:sz", "18"),
                            ("w:space", "4"),
                            ("w:color", "CC0000"),
                        ],
                    )?;
                } else {
                    let b_hex = clean_hex(&style.colors.border, "CBD5E1");
                    let sz = pt_to_eighth_pt(0.75).to_string();
                    write_empty(
                        &mut w,
                        "w:bottom",
                        &[
                            ("w:val", "single"),
                            ("w:sz", &sz),
                            ("w:space", "4"),
                            ("w:color", &b_hex),
                        ],
                    )?;
                }
                end_el(&mut w, "w:pBdr")?;
                write_empty(
                    &mut w,
                    "w:spacing",
                    &[("w:before", "100"), ("w:after", "160"), ("w:line", "120")],
                )?;
                end_el(&mut w, "w:pPr")?;
                end_el(&mut w, "w:p")?;
            }
            DocBlock::PageBreak { .. } => {
                start_el(&mut w, "w:p", &[])?;
                start_el(&mut w, "w:r", &[])?;
                write_empty(&mut w, "w:br", &[("w:type", "page")])?;
                end_el(&mut w, "w:r")?;
                end_el(&mut w, "w:p")?;
            }
        }
    }

    // Final section properties
    start_el(&mut w, "w:sectPr", &[])?;
    write_empty(
        &mut w,
        "w:headerReference",
        &[("w:type", "default"), ("r:id", "rId3")],
    )?;
    write_empty(
        &mut w,
        "w:footerReference",
        &[("w:type", "default"), ("r:id", "rId4")],
    )?;

    let pg_w = mm_to_twips(style.page.width_mm).to_string();
    let pg_h = mm_to_twips(style.page.height_mm).to_string();
    write_empty(&mut w, "w:pgSz", &[("w:w", &pg_w), ("w:h", &pg_h)])?;

    let m_top = mm_to_twips(style.page.margin_top_mm).to_string();
    let m_bottom = mm_to_twips(style.page.margin_bottom_mm).to_string();
    let m_left = mm_to_twips(style.page.margin_left_mm).to_string();
    let m_right = mm_to_twips(style.page.margin_right_mm).to_string();
    write_empty(
        &mut w,
        "w:pgMar",
        &[
            ("w:top", &m_top),
            ("w:right", &m_right),
            ("w:bottom", &m_bottom),
            ("w:left", &m_left),
            ("w:header", "851"),
            ("w:footer", "992"),
            ("w:gutter", "0"),
        ],
    )?;
    end_el(&mut w, "w:sectPr")?;

    end_el(&mut w, "w:body")?;
    end_el(&mut w, "w:document")?;
    finish_writer(w)
}

pub fn compile_docx_bytes(doc: &DocDocument, style: &StyleProfile) -> Result<Vec<u8>, String> {
    let buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buf);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    let entries: [(&str, Vec<u8>); 7] = [
        ("[Content_Types].xml", build_content_types()?),
        ("_rels/.rels", build_root_rels()?),
        ("word/_rels/document.xml.rels", build_document_rels()?),
        ("word/styles.xml", build_styles_xml(style)?),
        ("word/numbering.xml", build_numbering_xml(&style.typography.body)?),
        ("word/header1.xml", build_header_xml(style)?),
        ("word/footer1.xml", build_footer_xml(style)?),
    ];

    for (name, bytes) in entries {
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    let doc_xml = build_document_xml(doc, style)?;
    zip.start_file("word/document.xml", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&doc_xml).map_err(|e| e.to_string())?;

    let cursor = zip.finish().map_err(|e| e.to_string())?;
    Ok(cursor.into_inner())
}

pub fn compile_docx_to_file(
    doc: &DocDocument,
    style: &StyleProfile,
    output_path: &str,
) -> Result<String, String> {
    let bytes = compile_docx_bytes(doc, style)?;
    let path = Path::new(output_path);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
        }
    }
    let mut file = File::create(path).map_err(|e| format!("Failed to create docx file: {e}"))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write docx bytes: {e}"))?;
    Ok(output_path.to_string())
}

#[cfg(test)]
pub fn sample_gbt9704_style() -> StyleProfile {
    use crate::models::{
        ColorPalette, HeaderFooterConfig, PageSetup, TableStyleSpec, TypographySet,
    };
    let make_spec = |zh: &str,
                     en: &str,
                     size: f64,
                     bold: bool,
                     align: &str,
                     rule: &str,
                     val: f64,
                     indent: f64| TextStyleSpec {
        font_zh: zh.to_string(),
        font_en: en.to_string(),
        size_pt: size,
        bold,
        italic: false,
        color: "#000000".to_string(),
        align: align.to_string(),
        line_spacing_rule: rule.to_string(),
        line_spacing_value: val,
        space_before_pt: 0.0,
        space_after_pt: 0.0,
        first_line_indent_chars: indent,
        keep_with_next: None,
        border_bottom: None,
        background_color: None,
    };
    StyleProfile {
        id: "gov-gbt9704".to_string(),
        name: "党政机关公文 (GB/T 9704)".to_string(),
        description: "国标公文排版规范".to_string(),
        category: "gov".to_string(),
        page: PageSetup {
            size: "A4".to_string(),
            width_mm: 210.0,
            height_mm: 297.0,
            margin_top_mm: 37.0,
            margin_bottom_mm: 35.0,
            margin_left_mm: 28.0,
            margin_right_mm: 26.0,
        },
        header_footer: HeaderFooterConfig {
            show_header: false,
            header_text: String::new(),
            header_border_bottom: false,
            show_footer: true,
            footer_text: String::new(),
            show_page_number: true,
            page_number_format: "dash".to_string(),
            page_number_align: "center".to_string(),
        },
        colors: ColorPalette {
            primary: "#CC0000".to_string(),
            accent: "#CC0000".to_string(),
            text: "#000000".to_string(),
            muted: "#475569".to_string(),
            border: "#000000".to_string(),
            table_header_bg: "#F8FAFC".to_string(),
            table_zebra_bg: "#FFFFFF".to_string(),
            callout_bg: "#FEF2F2".to_string(),
        },
        typography: TypographySet {
            title: make_spec("方正小标宋简体", "Times New Roman", 22.0, false, "center", "exact", 30.0, 0.0),
            subtitle: make_spec("仿宋_GB2312", "Times New Roman", 16.0, false, "center", "exact", 28.0, 0.0),
            h1: make_spec("黑体", "Times New Roman", 16.0, false, "left", "exact", 28.0, 2.0),
            h2: make_spec("楷体_GB2312", "Times New Roman", 16.0, false, "left", "exact", 28.0, 2.0),
            h3: make_spec("仿宋_GB2312", "Times New Roman", 16.0, true, "left", "exact", 28.0, 2.0),
            h4: make_spec("仿宋_GB2312", "Times New Roman", 16.0, false, "left", "exact", 28.0, 2.0),
            body: make_spec("仿宋_GB2312", "Times New Roman", 16.0, false, "justify", "exact", 28.0, 2.0),
            quote: make_spec("楷体_GB2312", "Times New Roman", 14.0, false, "justify", "exact", 24.0, 0.0),
            caption: make_spec("黑体", "Times New Roman", 10.5, true, "center", "multiple", 1.25, 0.0),
            table_header: make_spec("黑体", "Times New Roman", 10.5, true, "center", "multiple", 1.15, 0.0),
            table_cell: make_spec("仿宋_GB2312", "Times New Roman", 10.5, false, "left", "multiple", 1.15, 0.0),
        },
        numbering: HeadingNumbering {
            enabled: true,
            h1_pattern: "{zh1}、".to_string(),
            h2_pattern: "（{zh2}）".to_string(),
            h3_pattern: "{n3}.".to_string(),
            h4_pattern: "（{n4}）".to_string(),
        },
        table: TableStyleSpec {
            style: "three_line".to_string(),
            border_color: "#000000".to_string(),
            header_bg: "transparent".to_string(),
            header_text_color: "#000000".to_string(),
            zebra_bg: "transparent".to_string(),
            repeat_header: true,
            cell_padding_pt: 4.0,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use quick_xml::Reader;
    use std::io::Read;
    use zip::ZipArchive;

    #[test]
    fn test_chinese_numeral_and_heading_format() {
        assert_eq!(to_chinese_numeral(1), "一");
        assert_eq!(to_chinese_numeral(10), "十");
        assert_eq!(to_chinese_numeral(11), "十一");
        assert_eq!(to_chinese_numeral(23), "二十三");

        let numbering = HeadingNumbering {
            enabled: true,
            h1_pattern: "{zh1}、".to_string(),
            h2_pattern: "（{zh2}）".to_string(),
            h3_pattern: "{n1}.{n2}.{n3} ".to_string(),
            h4_pattern: "({n4}) ".to_string(),
        };
        assert_eq!(format_heading_number(1, &[2, 0, 0, 0], &numbering), "二、");
        assert_eq!(format_heading_number(2, &[2, 3, 0, 0], &numbering), "（三）");
        assert_eq!(format_heading_number(3, &[2, 3, 4, 0], &numbering), "2.3.4 ");
    }

    #[test]
    fn test_compile_docx_produces_valid_ooxml_parts() {
        let style = sample_gbt9704_style();
        let doc = DocDocument {
            id: "doc-1".to_string(),
            title: "关于推进数字化办公的通知".to_string(),
            style_profile_id: style.id.clone(),
            updated_at: "2026-11-23T00:00:00Z".to_string(),
            blocks: vec![
                DocBlock::Title {
                    id: "b1".to_string(),
                    text: "关于推进全流程无纸化办公的通知".to_string(),
                },
                DocBlock::Divider {
                    id: "b2".to_string(),
                    style: Some("double_red".to_string()),
                },
                DocBlock::Heading {
                    id: "b3".to_string(),
                    level: 1,
                    text: "总体要求".to_string(),
                },
                DocBlock::Paragraph {
                    id: "b4".to_string(),
                    runs: vec![
                        TextRun::plain("各部门应当坚持"),
                        TextRun {
                            text: "统一规范、安全高效".to_string(),
                            bold: Some(true),
                            italic: None,
                            underline: None,
                            code: None,
                            color: None,
                        },
                        TextRun::plain("的原则落实相关工作。"),
                    ],
                    indent: None,
                    align: None,
                },
                DocBlock::List {
                    id: "b5".to_string(),
                    ordered: true,
                    items: vec![
                        vec![TextRun::plain("完成基础设施升级")],
                        vec![TextRun::plain("统一文档排版模板")],
                    ],
                },
                DocBlock::Quote {
                    id: "b6".to_string(),
                    title: Some("工作提示".to_string()),
                    text: "请于本月底前报送实施台账。".to_string(),
                    variant: Some("note".to_string()),
                },
                DocBlock::CodeBlock {
                    id: "b7".to_string(),
                    language: Some("json".to_string()),
                    code: "{\"status\": \"ok\"}".to_string(),
                },
                DocBlock::Table {
                    id: "b8".to_string(),
                    caption: Some("表1 阶段任务安排".to_string()),
                    headers: vec!["阶段".to_string(), "负责人".to_string(), "截止日期".to_string()],
                    rows: vec![
                        vec!["一期".to_string(), "信息中心".to_string(), "12月10日".to_string()],
                        vec!["二期".to_string(), "办公室".to_string(), "12月30日".to_string()],
                    ],
                },
                DocBlock::PageBreak {
                    id: "b9".to_string(),
                },
            ],
        };

        let bytes = compile_docx_bytes(&doc, &style).expect("compile_docx_bytes failed");
        assert!(bytes.len() > 1500);

        let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("invalid zip");
        let expected_files = [
            "[Content_Types].xml",
            "_rels/.rels",
            "word/_rels/document.xml.rels",
            "word/styles.xml",
            "word/numbering.xml",
            "word/header1.xml",
            "word/footer1.xml",
            "word/document.xml",
        ];
        for name in expected_files {
            let mut file = archive.by_name(name).expect(name);
            let mut xml = String::new();
            file.read_to_string(&mut xml).expect("read xml");
            let mut reader = Reader::from_str(&xml);
            let mut buf = Vec::new();
            loop {
                match reader.read_event_into(&mut buf) {
                    Ok(Event::Eof) => break,
                    Ok(_) => {}
                    Err(e) => panic!("XML parse error in {}: {:?}", name, e),
                }
                buf.clear();
            }
            if name == "word/document.xml" {
                assert!(xml.contains("w:eastAsia=\"仿宋_GB2312\""));
                assert!(xml.contains("w:firstLineChars=\"200\""));
                assert!(xml.contains("w:lineRule=\"exact\""));
                assert!(xml.contains("w:tblHeader"));
                assert!(xml.contains("一、总体要求"));
                assert!(xml.contains("thickThinSmallGap"));
            }
        }
    }
}
