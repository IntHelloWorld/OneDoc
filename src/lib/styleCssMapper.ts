import type { CSSProperties } from "react";
import type { HeadingNumbering, StyleProfile, TextStyleSpec } from "../types/style";

export function toChineseNumeral(num: number): string {
  if (num <= 0) return "零";
  const digits = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (num <= 9) return digits[num];
  if (num < 20) return `十${digits[num - 10]}`;
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${digits[tens]}十${digits[ones]}`;
  }
  if (num < 1000) {
    const h = Math.floor(num / 100);
    const rem = num % 100;
    if (rem === 0) return `${digits[h]}百`;
    const tens = Math.floor(rem / 10);
    const ones = rem % 10;
    if (tens === 0) return `${digits[h]}百零${digits[ones]}`;
    return `${digits[h]}百${digits[tens]}十${digits[ones]}`;
  }
  return String(num);
}

export function formatHeadingNumber(
  level: 1 | 2 | 3 | 4,
  counters: [number, number, number, number],
  numbering: HeadingNumbering
): string {
  if (!numbering.enabled) return "";
  const pattern =
    level === 1
      ? numbering.h1Pattern
      : level === 2
      ? numbering.h2Pattern
      : level === 3
      ? numbering.h3Pattern
      : numbering.h4Pattern;

  if (!pattern.trim()) return "";

  return pattern
    .replaceAll("{n1}", String(counters[0]))
    .replaceAll("{n2}", String(counters[1]))
    .replaceAll("{n3}", String(counters[2]))
    .replaceAll("{n4}", String(counters[3]))
    .replaceAll("{zh1}", toChineseNumeral(counters[0]))
    .replaceAll("{zh2}", toChineseNumeral(counters[1]))
    .replaceAll("{zh3}", toChineseNumeral(counters[2]))
    .replaceAll("{zh4}", toChineseNumeral(counters[3]));
}

export function buildFontFamily(spec: TextStyleSpec): string {
  const en = spec.fontEn ? `"${spec.fontEn}", ` : "";
  const zh = spec.fontZh ? `"${spec.fontZh}", ` : "";
  return `${en}${zh}"Microsoft YaHei", "PingFang SC", serif, sans-serif`;
}

export function specToCss(
  spec: TextStyleSpec,
  overrideIndent?: boolean,
  overrideAlign?: string
): CSSProperties {
  const effectiveIndent =
    overrideIndent === false
      ? 0
      : overrideIndent === true
      ? spec.firstLineIndentChars > 0
        ? spec.firstLineIndentChars
        : 2
      : spec.firstLineIndentChars;

  const lineHeight =
    spec.lineSpacingRule === "exact"
      ? `${spec.lineSpacingValue}pt`
      : String(spec.lineSpacingValue);

  const alignVal = (overrideAlign ?? spec.align) as CSSProperties["textAlign"];

  return {
    fontFamily: buildFontFamily(spec),
    fontSize: `${spec.sizePt}pt`,
    fontWeight: spec.bold ? 700 : 400,
    fontStyle: spec.italic ? "italic" : "normal",
    color: spec.color,
    textAlign: alignVal,
    lineHeight,
    marginTop: `${spec.spaceBeforePt}pt`,
    marginBottom: `${spec.spaceAfterPt}pt`,
    textIndent: effectiveIndent > 0 ? `${effectiveIndent}em` : "0",
    borderBottom: spec.borderBottom ? "1px solid #CBD5E1" : undefined,
    paddingBottom: spec.borderBottom ? "4pt" : undefined,
  };
}

export function getPageSheetStyle(style: StyleProfile): CSSProperties {
  return {
    width: `${style.page.widthMm}mm`,
    minHeight: `${style.page.heightMm}mm`,
    paddingTop: `${style.page.marginTopMm}mm`,
    paddingBottom: `${style.page.marginBottomMm}mm`,
    paddingLeft: `${style.page.marginLeftMm}mm`,
    paddingRight: `${style.page.marginRightMm}mm`,
    backgroundColor: "#FFFFFF",
    color: style.colors.text,
  };
}
