use crate::docx_compiler::{compile_docx_to_file};
use crate::models::{
    ColorPalette, DocBlock, DocDocument, FileTreeNode, HeaderFooterConfig, HeadingNumbering,
    PageSetup, StyleProfile, TableStyleSpec, TextRun, TextStyleSpec, TypographySet,
    WorkspaceFileContent,
};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::fs;
use std::path::{Path, PathBuf};

fn detect_kind(path: &Path) -> Option<&'static str> {
    let name = path.file_name()?.to_string_lossy().to_lowercase();
    if name.ends_with(".onedoc.json") {
        return Some("onedoc");
    }
    match path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()).as_deref() {
        Some("docx") => Some("docx"),
        Some("md") | Some("markdown") => Some("md"),
        Some("txt") => Some("txt"),
        _ => None,
    }
}

fn should_ignore(name: &str) -> bool {
    name.starts_with('.')
        || matches!(
            name,
            "node_modules" | "target" | "dist" | "build" | "__pycache__"
        )
}

fn build_tree(root: &Path, dir: &Path, depth: usize) -> Result<Vec<FileTreeNode>, String> {
    if depth > 6 {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {e}"))?;
    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if should_ignore(&name) {
            continue;
        }
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let full = path.to_string_lossy().to_string();

        if path.is_dir() {
            let children = build_tree(root, &path, depth + 1)?;
            dirs.push(FileTreeNode {
                name,
                path: full,
                relative_path: rel,
                is_dir: true,
                kind: "dir".to_string(),
                size: None,
                children: Some(children),
            });
        } else if let Some(kind) = detect_kind(&path) {
            let size = fs::metadata(&path).ok().map(|m| m.len());
            files.push(FileTreeNode {
                name,
                path: full,
                relative_path: rel,
                is_dir: false,
                kind: kind.to_string(),
                size,
                children: None,
            });
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);
    Ok(dirs)
}

pub fn scan_workspace(root_path: &str) -> Result<Vec<FileTreeNode>, String> {
    let root = Path::new(root_path);
    if !root.exists() || !root.is_dir() {
        return Err("工作区目录不存在".to_string());
    }
    build_tree(root, root, 0)
}

pub fn read_workspace_file(path: &str) -> Result<WorkspaceFileContent, String> {
    let p = Path::new(path);
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("未命名")
        .to_string();
    let kind = detect_kind(p).unwrap_or("txt").to_string();

    if kind == "docx" {
        return Ok(WorkspaceFileContent {
            path: path.to_string(),
            name,
            kind,
            content: String::new(),
            document: None,
        });
    }

    let content = fs::read_to_string(p).map_err(|e| format!("读取文件失败: {e}"))?;
    let document = if kind == "onedoc" {
        serde_json::from_str::<DocDocument>(&content).ok()
    } else {
        None
    };

    Ok(WorkspaceFileContent {
        path: path.to_string(),
        name,
        kind,
        content,
        document,
    })
}

pub fn read_text_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("读取文件失败: {e}"))
}

pub fn write_text_file(path: &str, content: &str) -> Result<(), String> {
    let p = Path::new(path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
    }
    fs::write(p, content).map_err(|e| format!("写入文件失败: {e}"))
}

pub fn read_file_base64(path: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("读取二进制文件失败: {e}"))?;
    Ok(STANDARD.encode(bytes))
}

pub fn delete_workspace_file(workspace_root: &str, file_path: &str) -> Result<(), String> {
    let root = fs::canonicalize(workspace_root).map_err(|e| format!("无效工作区路径: {e}"))?;
    let target = fs::canonicalize(file_path).map_err(|e| format!("目标文件不存在: {e}"))?;
    if !target.starts_with(&root) {
        return Err("安全拦截：禁止删除工作区外的文件".to_string());
    }
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| format!("删除目录失败: {e}"))
    } else {
        fs::remove_file(&target).map_err(|e| format!("删除文件失败: {e}"))
    }
}

fn styles_dir(root_path: &str) -> PathBuf {
    Path::new(root_path).join(".onedoc").join("styles")
}

pub fn load_workspace_styles(root_path: &str) -> Result<Vec<StyleProfile>, String> {
    let dir = styles_dir(root_path);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut styles = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(raw) = fs::read_to_string(&path) {
                if let Ok(profile) = serde_json::from_str::<StyleProfile>(&raw) {
                    styles.push(profile);
                }
            }
        }
    }
    Ok(styles)
}

pub fn save_workspace_style(root_path: &str, profile: &StyleProfile) -> Result<(), String> {
    let dir = styles_dir(root_path);
    fs::create_dir_all(&dir).map_err(|e| format!("创建样式目录失败: {e}"))?;
    let file_path = dir.join(format!("{}.json", profile.id));
    let json = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
    fs::write(file_path, json).map_err(|e| format!("保存样式失败: {e}"))
}

fn demo_gov_style() -> StyleProfile {
    let spec = |zh: &str,
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
            title: spec("方正小标宋简体", "Times New Roman", 22.0, false, "center", "exact", 30.0, 0.0),
            subtitle: spec("仿宋_GB2312", "Times New Roman", 16.0, false, "center", "exact", 28.0, 0.0),
            h1: spec("黑体", "Times New Roman", 16.0, false, "left", "exact", 28.0, 2.0),
            h2: spec("楷体_GB2312", "Times New Roman", 16.0, false, "left", "exact", 28.0, 2.0),
            h3: spec("仿宋_GB2312", "Times New Roman", 16.0, true, "left", "exact", 28.0, 2.0),
            h4: spec("仿宋_GB2312", "Times New Roman", 16.0, false, "left", "exact", 28.0, 2.0),
            body: spec("仿宋_GB2312", "Times New Roman", 16.0, false, "justify", "exact", 28.0, 2.0),
            quote: spec("楷体_GB2312", "Times New Roman", 14.0, false, "justify", "exact", 24.0, 0.0),
            caption: spec("黑体", "Times New Roman", 10.5, true, "center", "multiple", 1.25, 0.0),
            table_header: spec("黑体", "Times New Roman", 10.5, true, "center", "multiple", 1.15, 0.0),
            table_cell: spec("仿宋_GB2312", "Times New Roman", 10.5, false, "left", "multiple", 1.15, 0.0),
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

pub fn create_sample_workspace(target_dir: &str) -> Result<String, String> {
    let root = Path::new(target_dir);
    fs::create_dir_all(root).map_err(|e| format!("创建示例工作区失败: {e}"))?;

    // 1. Sample .onedoc.json
    let onedoc = DocDocument {
        id: "sample-report-01".to_string(),
        title: "OneDoc 智能文档工程平台建设方案".to_string(),
        style_profile_id: "modern-report".to_string(),
        updated_at: "2026-11-23T12:00:00Z".to_string(),
        blocks: vec![
            DocBlock::Title {
                id: "s-title".to_string(),
                text: "智能文档工程平台建设方案".to_string(),
            },
            DocBlock::Subtitle {
                id: "s-sub".to_string(),
                text: "面向政企办公、招投标与科研写作的下一代 Agent Harness 系统".to_string(),
            },
            DocBlock::Heading {
                id: "s-h1".to_string(),
                level: 1,
                text: "建设背景与核心痛点".to_string(),
            },
            DocBlock::Paragraph {
                id: "s-p1".to_string(),
                runs: vec![
                    TextRun::plain("当前通用大模型在生成正式 Word（.docx）文档时普遍存在"),
                    TextRun {
                        text: "内容与版式强耦合、多级标题编号错乱、中西文字体混排失真".to_string(),
                        bold: Some(true),
                        italic: None,
                        underline: None,
                        code: None,
                        color: None,
                    },
                    TextRun::plain("等问题。本方案通过将语义 AST 与确定性样式编译器解耦，实现即写即所得的合规交付。"),
                ],
                indent: None,
                align: None,
            },
            DocBlock::Quote {
                id: "s-q1".to_string(),
                title: Some("核心架构原则".to_string()),
                text: "AI 仅专注输出高纯度语义结构，一切页边距、字体字号、三线表及多级编号交由本地确定性编译器精确渲染。".to_string(),
                variant: Some("note".to_string()),
            },
            DocBlock::Heading {
                id: "s-h2".to_string(),
                level: 1,
                text: "核心能力对比".to_string(),
            },
            DocBlock::Table {
                id: "s-t1".to_string(),
                caption: Some("表1 传统 AI 写文档与 OneDoc 架构对比".to_string()),
                headers: vec!["评估维度".to_string(), "传统 LLM 脚本方式".to_string(), "OneDoc Harness".to_string()],
                rows: vec![
                    vec!["排版一致性".to_string(), "每次生成样式漂移".to_string(), "100% 受控样式契约".to_string()],
                    vec!["修改反馈".to_string(), "盲盒重生成，耗时高".to_string(), "实时分页预览 + 块级 Diff".to_string()],
                    vec!["范文复用".to_string(), "需手工反复写 Prompt".to_string(), "支持 .docx 样式一键反向提取".to_string()],
                ],
            },
        ],
    };
    let onedoc_json = serde_json::to_string_pretty(&onedoc).map_err(|e| e.to_string())?;
    fs::write(root.join("01_项目建设方案.onedoc.json"), onedoc_json)
        .map_err(|e| e.to_string())?;

    // 2. Sample real .docx compiled with GB/T 9704 style (can be previewed and extracted!)
    let gov_style = demo_gov_style();
    let gov_doc = DocDocument {
        id: "sample-gov-02".to_string(),
        title: "关于开展全员数字化公文规范试点的通知".to_string(),
        style_profile_id: gov_style.id.clone(),
        updated_at: "2026-11-23T12:00:00Z".to_string(),
        blocks: vec![
            DocBlock::Title {
                id: "g-t".to_string(),
                text: "关于开展全员数字化公文规范试点的通知".to_string(),
            },
            DocBlock::Divider {
                id: "g-d".to_string(),
                style: Some("double_red".to_string()),
            },
            DocBlock::Heading {
                id: "g-h1".to_string(),
                level: 1,
                text: "工作目标".to_string(),
            },
            DocBlock::Paragraph {
                id: "g-p1".to_string(),
                runs: vec![TextRun::plain(
                    "为进一步提升各部门公文拟制与流转质效，严格落实 GB/T 9704 党政机关公文格式要求，决定在全单位开展智能化排版试点工作。",
                )],
                indent: None,
                align: None,
            },
            DocBlock::Heading {
                id: "g-h2".to_string(),
                level: 2,
                text: "统一字体与行距标准".to_string(),
            },
            DocBlock::Paragraph {
                id: "g-p2".to_string(),
                runs: vec![TextRun::plain(
                    "正文统一采用三号仿宋_GB2312字体，首行缩进二字符，行距固定二十八磅；一级标题用黑体，二级标题用楷体_GB2312。",
                )],
                indent: None,
                align: None,
            },
        ],
    };
    let docx_path = root.join("02_公文排版范文_GBT9704.docx");
    compile_docx_to_file(&gov_doc, &gov_style, &docx_path.to_string_lossy())?;

    // 3. Sample Markdown
    let md_sample = "# 需求调研会议纪要\n\n## 一、核心业务诉求\n\n- 支持 **docx / md / txt** 混合工作区预览与上下文挂载\n- 支持按不同组织或高校模板一键切换排版样式\n- 支持选定局部段落让 AI 精准改写并高亮对比 Diff\n\n## 二、里程碑安排\n\n| 阶段 | 交付物 | 负责人 |\n| --- | --- | --- |\n| Phase 1 | 样式编译器与桌面端工作台 | 研发组 |\n| Phase 2 | 存量文档修订模式与批量审校 | 算法组 |\n";
    fs::write(root.join("03_需求调研会议纪要.md"), md_sample).map_err(|e| e.to_string())?;

    // 4. Sample TXT reference material
    let txt_sample = "【2026年度参考数据口径】\n1. 全年预计研发投入：1,280 万元\n2. 预期文档合规审校效率提升：4.6 倍\n3. 覆盖业务部门：办公室、法务部、招采中心、技术研发部\n4. 验收指标：所有导出 .docx 文件需在 Microsoft Word 与 WPS 中零错位打开。\n";
    fs::write(root.join("04_参考数据与口径.txt"), txt_sample).map_err(|e| e.to_string())?;

    Ok(target_dir.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use zip::ZipArchive;

    #[test]
    fn test_sample_workspace_smoke_and_docx_zip() {
        let tmp = std::env::temp_dir().join("onedoc_workspace_smoke");
        let _ = fs::remove_dir_all(&tmp);
        let dir_str = tmp.to_string_lossy().to_string();

        create_sample_workspace(&dir_str).expect("create_sample_workspace failed");
        let tree = scan_workspace(&dir_str).expect("scan_workspace failed");
        assert_eq!(tree.len(), 4);

        let docx_path = tmp.join("02_公文排版范文_GBT9704.docx");
        assert!(docx_path.exists());
        let file = fs::File::open(&docx_path).expect("open docx");
        let mut zip = ZipArchive::new(file).expect("valid zip");
        for entry in [
            "[Content_Types].xml",
            "word/document.xml",
            "word/styles.xml",
            "word/numbering.xml",
            "word/header1.xml",
            "word/footer1.xml",
        ] {
            let mut zf = zip.by_name(entry).expect(entry);
            let mut xml = String::new();
            zf.read_to_string(&mut xml).expect("read xml");
            assert!(!xml.is_empty());
        }

        let _ = fs::remove_dir_all(&tmp);
    }
}
