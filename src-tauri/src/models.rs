use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextRun {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

impl TextRun {
    pub fn plain(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            bold: None,
            italic: None,
            underline: None,
            code: None,
            color: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DocBlock {
    Title {
        id: String,
        text: String,
    },
    Subtitle {
        id: String,
        text: String,
    },
    Heading {
        id: String,
        level: u8,
        text: String,
    },
    Paragraph {
        id: String,
        runs: Vec<TextRun>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        indent: Option<bool>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        align: Option<String>,
    },
    List {
        id: String,
        ordered: bool,
        items: Vec<Vec<TextRun>>,
    },
    Quote {
        id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        title: Option<String>,
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        variant: Option<String>,
    },
    CodeBlock {
        id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        language: Option<String>,
        code: String,
    },
    Table {
        id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        caption: Option<String>,
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
    Divider {
        id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        style: Option<String>,
    },
    PageBreak {
        id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocDocument {
    pub id: String,
    pub title: String,
    pub style_profile_id: String,
    pub blocks: Vec<DocBlock>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSetup {
    pub size: String,
    pub width_mm: f64,
    pub height_mm: f64,
    pub margin_top_mm: f64,
    pub margin_bottom_mm: f64,
    pub margin_left_mm: f64,
    pub margin_right_mm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeaderFooterConfig {
    pub show_header: bool,
    pub header_text: String,
    pub header_border_bottom: bool,
    pub show_footer: bool,
    pub footer_text: String,
    pub show_page_number: bool,
    pub page_number_format: String,
    pub page_number_align: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorPalette {
    pub primary: String,
    pub accent: String,
    pub text: String,
    pub muted: String,
    pub border: String,
    pub table_header_bg: String,
    pub table_zebra_bg: String,
    pub callout_bg: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextStyleSpec {
    pub font_zh: String,
    pub font_en: String,
    pub size_pt: f64,
    pub bold: bool,
    pub italic: bool,
    pub color: String,
    pub align: String,
    pub line_spacing_rule: String,
    pub line_spacing_value: f64,
    pub space_before_pt: f64,
    pub space_after_pt: f64,
    pub first_line_indent_chars: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keep_with_next: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_bottom: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypographySet {
    pub title: TextStyleSpec,
    pub subtitle: TextStyleSpec,
    pub h1: TextStyleSpec,
    pub h2: TextStyleSpec,
    pub h3: TextStyleSpec,
    pub h4: TextStyleSpec,
    pub body: TextStyleSpec,
    pub quote: TextStyleSpec,
    pub caption: TextStyleSpec,
    pub table_header: TextStyleSpec,
    pub table_cell: TextStyleSpec,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadingNumbering {
    pub enabled: bool,
    pub h1_pattern: String,
    pub h2_pattern: String,
    pub h3_pattern: String,
    pub h4_pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableStyleSpec {
    pub style: String,
    pub border_color: String,
    pub header_bg: String,
    pub header_text_color: String,
    pub zebra_bg: String,
    pub repeat_header: bool,
    pub cell_padding_pt: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub page: PageSetup,
    pub header_footer: HeaderFooterConfig,
    pub colors: ColorPalette,
    pub typography: TypographySet,
    pub numbering: HeadingNumbering,
    pub table: TableStyleSpec,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileTreeNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileContent {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub document: Option<DocDocument>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedStyleResult {
    pub profile: StyleProfile,
    pub summary: Vec<String>,
}
