export interface PageSetup {
  size: "A4" | "B5" | "Letter" | string;
  widthMm: number;
  heightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
}

export interface HeaderFooterConfig {
  showHeader: boolean;
  headerText: string;
  headerBorderBottom: boolean;
  showFooter: boolean;
  footerText: string;
  showPageNumber: boolean;
  pageNumberFormat: "plain" | "dash" | "of_total" | string;
  pageNumberAlign: "left" | "center" | "right" | string;
}

export interface ColorPalette {
  primary: string;
  accent: string;
  text: string;
  muted: string;
  border: string;
  tableHeaderBg: string;
  tableZebraBg: string;
  calloutBg: string;
}

export interface TextStyleSpec {
  fontZh: string;
  fontEn: string;
  sizePt: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: "left" | "center" | "right" | "justify" | string;
  lineSpacingRule: "multiple" | "exact" | string;
  lineSpacingValue: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
  firstLineIndentChars: number;
  keepWithNext?: boolean;
  borderBottom?: boolean;
  backgroundColor?: string;
}

export interface TypographySet {
  title: TextStyleSpec;
  subtitle: TextStyleSpec;
  h1: TextStyleSpec;
  h2: TextStyleSpec;
  h3: TextStyleSpec;
  h4: TextStyleSpec;
  body: TextStyleSpec;
  quote: TextStyleSpec;
  caption: TextStyleSpec;
  tableHeader: TextStyleSpec;
  tableCell: TextStyleSpec;
}

export interface HeadingNumbering {
  enabled: boolean;
  h1Pattern: string;
  h2Pattern: string;
  h3Pattern: string;
  h4Pattern: string;
}

export interface TableStyleSpec {
  style: "three_line" | "zebra" | "grid" | string;
  borderColor: string;
  headerBg: string;
  headerTextColor: string;
  zebraBg: string;
  repeatHeader: boolean;
  cellPaddingPt: number;
}

export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  category: "report" | "gov" | "academic" | "bid" | "custom" | string;
  page: PageSetup;
  headerFooter: HeaderFooterConfig;
  colors: ColorPalette;
  typography: TypographySet;
  numbering: HeadingNumbering;
  table: TableStyleSpec;
}

export interface ExtractedStyleResult {
  profile: StyleProfile;
  summary: string[];
}
