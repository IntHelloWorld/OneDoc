/**
 * DOM-aware post-render pagination engine for `docx-preview`.
 *
 * `docx-preview`'s built-in `breakPages: true` only splits pages on explicit
 * `<w:br w:type="page"/>`, `pageBreakBefore`, or section size/orientation changes.
 * Continuous flowing documents (including OneDoc's Rust-compiled `.docx` files
 * and edited Word documents without cached breaks) render inside a single tall
 * `<section class="docx">`.
 *
 * This engine inspects every rendered `<section class="docx">`, preserves its
 * declared page geometry (width, height, margins, headers, footers, footnotes,
 * styles, and CSS numbering counters), and paginates overflowing sections into
 * discrete fixed-size paper sheets.
 */

export interface PaginationOptions {
  /** Fallback portrait page height in CSS px when section min-height is absent (A4 = 297mm). */
  fallbackPageHeightPx?: number;
  /** Fallback portrait page width in CSS px when section width is absent (A4 = 210mm). */
  fallbackPageWidthPx?: number;
  /** Pixel tolerance before treating a section as overflowing its target height. */
  overflowTolerancePx?: number;
  /** Hard upper bound on pages produced per section to guarantee termination. */
  maxPagesPerSection?: number;
}

export interface PaginationResult {
  pageCount: number;
  originalSectionCount: number;
  splitSectionCount: number;
  pageWidthPx: number;
  pageHeightPx: number;
}

interface BlockMetrics {
  height: number;
  marginTop: number;
  marginBottom: number;
  isFloating: boolean;
  isEmptyNoise: boolean;
}

interface PageContext {
  page: HTMLElement;
  article: HTMLElement;
  footer: HTMLElement | null;
  usedHeight: number;
  prevMarginBottom: number;
  itemCount: number;
}

interface TableParts {
  colgroup: HTMLElement | null;
  headerRows: HTMLTableRowElement[];
  hasExplicitThead: boolean;
  hadTbody: boolean;
  bodyGroups: HTMLTableRowElement[][];
  footerRows: HTMLTableRowElement[];
}

const A4_WIDTH_PX = (210 * 96) / 25.4; // ~793.70px
const A4_HEIGHT_PX = (297 * 96) / 25.4; // ~1122.52px
const DEFAULT_OVERFLOW_TOLERANCE_PX = 2.5;
const DEFAULT_MAX_PAGES_PER_SECTION = 400;

/**
 * Wait for fonts and embedded images inside the rendered DOCX container to settle
 * so DOM height measurements reflect final layout geometry.
 */
export async function waitForDocxResources(
  container: HTMLElement,
  timeoutMs = 1500
): Promise<void> {
  const fontPromise =
    typeof document !== "undefined" && document.fonts?.ready
      ? Promise.race([
          document.fonts.ready.then(() => undefined),
          sleep(Math.min(600, timeoutMs)),
        ])
      : Promise.resolve();

  const images = Array.from(container.querySelectorAll("img"));
  const imagePromises = images.map((img) => {
    if (img.complete && img.naturalWidth > 0) {
      if (typeof img.decode === "function") {
        return img.decode().catch(() => undefined);
      }
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const done = () => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        resolve();
      };
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  });

  await Promise.race([
    Promise.all([fontPromise, ...imagePromises]),
    sleep(timeoutMs),
  ]);

  // Allow one animation frame for layout styles, VML SVGs, and decoded images to flush.
  await nextAnimationFrame();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextAnimationFrame(): Promise<void> {
  if (typeof requestAnimationFrame === "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * CSS vertical margin collapsing between two adjacent sibling block elements.
 */
export function collapseMargins(prevBottom: number, nextTop: number): number {
  if (prevBottom >= 0 && nextTop >= 0) {
    return Math.max(prevBottom, nextTop);
  }
  if (prevBottom < 0 && nextTop < 0) {
    return Math.min(prevBottom, nextTop);
  }
  return prevBottom + nextTop;
}

/**
 * Group consecutive table rows that are linked by `rowSpan > 1` cells so vertical
 * merges are kept intact when paginating tables across pages.
 * Handles `docx-preview`'s convention of marking merged continuation cells `display: none`.
 */
export function groupRowsByRowSpan(
  rows: HTMLTableRowElement[]
): HTMLTableRowElement[][] {
  const groups: HTMLTableRowElement[][] = [];
  let currentGroup: HTMLTableRowElement[] = [];
  const colSpans: number[] = [];

  for (const row of rows) {
    currentGroup.push(row);

    let colIdx = 0;
    for (const cell of Array.from(row.cells)) {
      if (cell.style.display === "none") continue;
      while ((colSpans[colIdx] ?? 0) > 0) {
        colIdx++;
      }
      const cSpan = Math.max(1, cell.colSpan || 1);
      const rSpan = Math.max(1, cell.rowSpan || 1);
      for (let c = 0; c < cSpan; c++) {
        colSpans[colIdx + c] = Math.max(colSpans[colIdx + c] ?? 0, rSpan);
      }
      colIdx += cSpan;
    }

    let maxRemaining = 0;
    for (let i = 0; i < colSpans.length; i++) {
      if (colSpans[i] > 0) {
        colSpans[i]--;
        if (colSpans[i] > maxRemaining) {
          maxRemaining = colSpans[i];
        }
      }
    }

    if (maxRemaining === 0) {
      groups.push(currentGroup);
      currentGroup = [];
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

function parsePx(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "auto" || trimmed === "none") return null;
  const num = parseFloat(trimmed);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function getCssScaleY(el: HTMLElement): number {
  const offsetH = el.offsetHeight;
  if (offsetH > 0) {
    const rectH = el.getBoundingClientRect().height;
    if (rectH > 0) {
      const ratio = rectH / offsetH;
      if (Number.isFinite(ratio) && ratio > 0.05 && ratio < 20) {
        return ratio;
      }
    }
  }
  const offsetW = el.offsetWidth;
  if (offsetW > 0) {
    const rectW = el.getBoundingClientRect().width;
    if (rectW > 0) {
      const ratio = rectW / offsetW;
      if (Number.isFinite(ratio) && ratio > 0.05 && ratio < 20) {
        return ratio;
      }
    }
  }
  return 1;
}

function measureUnscaledHeight(el: HTMLElement, scaleY: number): number {
  const rectH = el.getBoundingClientRect().height / scaleY;
  if (Number.isFinite(rectH) && rectH > 0) {
    return rectH;
  }
  return el.offsetHeight;
}

function measureFlexChildConsumption(
  el: HTMLElement | null,
  scaleY: number
): number {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  if (
    cs.display === "none" ||
    cs.position === "absolute" ||
    cs.position === "fixed"
  ) {
    return 0;
  }
  const height = measureUnscaledHeight(el, scaleY);
  const marginTop = parseFloat(cs.marginTop) || 0;
  const marginBottom = parseFloat(cs.marginBottom) || 0;
  return height + marginTop + marginBottom;
}

function measureBlock(el: HTMLElement, scaleY: number): BlockMetrics {
  const cs = getComputedStyle(el);
  const isFloating = cs.position === "absolute" || cs.position === "fixed";
  const height = isFloating ? 0 : measureUnscaledHeight(el, scaleY);
  const marginTop = isFloating ? 0 : parseFloat(cs.marginTop) || 0;
  const marginBottom = isFloating ? 0 : parseFloat(cs.marginBottom) || 0;
  const isEmptyNoise =
    !isFloating &&
    height < 0.5 &&
    marginTop === 0 &&
    marginBottom === 0 &&
    (el.textContent?.trim().length ?? 0) === 0 &&
    !el.querySelector("img, svg, table, hr, iframe, canvas");

  return { height, marginTop, marginBottom, isFloating, isEmptyNoise };
}

function stripDuplicateIds(root: Element): void {
  if (root.hasAttribute("id")) {
    root.removeAttribute("id");
  }
  const withIds = root.querySelectorAll("[id]");
  for (const el of Array.from(withIds)) {
    el.removeAttribute("id");
  }
}

function estimateBodyFontSize(section: HTMLElement): number {
  const sizes: number[] = [];
  const paragraphs = section.querySelectorAll("article p");
  const limit = Math.min(paragraphs.length, 40);
  for (let i = 0; i < limit; i++) {
    const p = paragraphs[i] as HTMLElement;
    const text = p.textContent?.trim() ?? "";
    if (text.length < 15) continue;
    const size = parseFloat(getComputedStyle(p).fontSize);
    if (Number.isFinite(size) && size > 6 && size < 48) {
      sizes.push(size);
    }
  }
  if (sizes.length === 0) return 14;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)];
}

function isHeadingOrKeepWithNext(
  el: HTMLElement,
  nextEl: HTMLElement | null,
  bodyFontSize: number
): boolean {
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag)) return true;

  const cs = getComputedStyle(el);
  if (cs.breakAfter === "avoid" || cs.pageBreakAfter === "avoid") {
    return true;
  }

  const className = typeof el.className === "string" ? el.className : "";
  if (/(?:heading|title|subtitle|caption)/i.test(className)) {
    return true;
  }

  if (tag !== "P" && tag !== "DIV") return false;

  const text = el.textContent?.trim() ?? "";
  if (!text || text.length > 90) return false;
  if (el.querySelector("table, img, svg, iframe")) return false;

  // Keep table/figure captions attached to an immediately following table/image.
  if (
    nextEl &&
    (nextEl.tagName === "TABLE" || nextEl.querySelector("img, svg")) &&
    /^(?:表|图|Table|Figure|Fig\.?)\s*[\d一二三四五六七八九十]/i.test(text)
  ) {
    return true;
  }

  const rectH = el.offsetHeight;
  if (rectH > 76) return false;

  // Inspect inline runs if paragraph spans carry explicit styling (standard in docx-preview).
  const fontSize = getEffectiveFontSize(el);
  if (fontSize >= bodyFontSize * 1.12) {
    return true;
  }

  // Short bold paragraph followed by another block (common Word heading or subheading).
  if (text.length <= 60 && isAllBoldText(el) && nextEl !== null) {
    // Avoid treating a list bullet item as a heading unless it has larger font.
    if (cs.display !== "list-item") {
      return true;
    }
  }

  return false;
}

function getEffectiveFontSize(el: HTMLElement): number {
  const spans = el.querySelectorAll("span");
  for (const span of Array.from(spans)) {
    if ((span.textContent?.trim().length ?? 0) > 0) {
      const sz = parseFloat(getComputedStyle(span).fontSize);
      if (Number.isFinite(sz) && sz > 0) return sz;
    }
  }
  return parseFloat(getComputedStyle(el).fontSize) || 14;
}

function isAllBoldText(el: HTMLElement): boolean {
  const spans = Array.from(el.querySelectorAll("span")).filter(
    (s) => (s.textContent?.trim().length ?? 0) > 0
  );
  if (spans.length === 0) {
    const fw = parseFontWeight(getComputedStyle(el).fontWeight);
    return fw >= 600;
  }
  return spans.every((s) => parseFontWeight(getComputedStyle(s).fontWeight) >= 600);
}

function parseFontWeight(weight: string): number {
  if (weight === "bold" || weight === "bolder") return 700;
  if (weight === "normal" || weight === "lighter") return 400;
  const n = parseInt(weight, 10);
  return Number.isFinite(n) ? n : 400;
}

function isTransparentColor(color: string | null | undefined): boolean {
  if (!color) return true;
  const c = color.trim().toLowerCase();
  return (
    c === "transparent" ||
    c === "rgba(0, 0, 0, 0)" ||
    c === "rgba(0,0,0,0)"
  );
}

function getRowVisualSignature(row: HTMLTableRowElement): {
  bg: string;
  allBold: boolean;
  allTh: boolean;
  borderBottomWidth: number;
  visibleCellCount: number;
} {
  const visibleCells = Array.from(row.cells).filter(
    (c) => c.style.display !== "none"
  );
  const rowBg = getComputedStyle(row).backgroundColor;
  let cellBg = isTransparentColor(rowBg) ? "" : rowBg;
  let allBold = true;
  let hasTextCell = false;
  let allTh = visibleCells.length > 0;
  let maxBottomBorder = 0;

  for (const cell of visibleCells) {
    if (cell.tagName !== "TH") allTh = false;
    const ccs = getComputedStyle(cell);
    if (!cellBg && !isTransparentColor(ccs.backgroundColor)) {
      cellBg = ccs.backgroundColor;
    }
    const bw = parseFloat(ccs.borderBottomWidth) || 0;
    if (bw > maxBottomBorder) maxBottomBorder = bw;

    if ((cell.textContent?.trim().length ?? 0) > 0) {
      hasTextCell = true;
      if (!isAllBoldText(cell)) {
        allBold = false;
      }
    }
  }

  return {
    bg: cellBg,
    allBold: hasTextCell && allBold,
    allTh,
    borderBottomWidth: maxBottomBorder,
    visibleCellCount: visibleCells.length,
  };
}

function detectImplicitHeaderRow(
  rows: HTMLTableRowElement[],
  availableContentHeight: number,
  scaleY: number
): boolean {
  if (rows.length < 2) return false;
  const firstRow = rows[0];
  const secondRow = rows[1];

  // Never repeat a header row that consumes more than 35% of the page height.
  const firstH = measureUnscaledHeight(firstRow, scaleY);
  if (firstH <= 0 || firstH > availableContentHeight * 0.35) {
    return false;
  }

  // Do not treat a vertically merged rowSpan cell as a repeatable single-row header.
  for (const cell of Array.from(firstRow.cells)) {
    if ((cell.rowSpan || 1) > 1) return false;
  }

  const sig0 = getRowVisualSignature(firstRow);
  const sig1 = getRowVisualSignature(secondRow);

  if (sig0.visibleCellCount === 0) return false;
  if (sig0.allTh) return true;

  // Distinct shaded header row (e.g., modern/zebra/grid tables).
  if (
    sig0.bg &&
    sig0.bg !== sig1.bg &&
    sig0.bg !== "rgb(255, 255, 255)"
  ) {
    return true;
  }

  // Bold header row over regular body row (covers academic three-line tables too).
  if (sig0.allBold && !sig1.allBold) {
    return true;
  }

  // Three-line table heuristic: thicker bottom rule under row 0 than row 1.
  if (sig0.borderBottomWidth > 0 && sig0.borderBottomWidth > sig1.borderBottomWidth + 0.3) {
    return true;
  }

  return false;
}

function extractTableParts(
  table: HTMLTableElement,
  availableContentHeight: number,
  scaleY: number
): TableParts {
  const colgroup = table.querySelector(":scope > colgroup") as HTMLElement | null;
  const thead = table.querySelector(":scope > thead") as HTMLTableSectionElement | null;
  const tfoot = table.querySelector(":scope > tfoot") as HTMLTableSectionElement | null;
  const tbodies = Array.from(
    table.querySelectorAll(":scope > tbody")
  ) as HTMLTableSectionElement[];

  const directRows = Array.from(
    table.querySelectorAll(":scope > tr")
  ) as HTMLTableRowElement[];

  const allBodySourceRows: HTMLTableRowElement[] = [];
  for (const child of Array.from(table.children)) {
    if (child.tagName === "TBODY") {
      allBodySourceRows.push(
        ...(Array.from(child.children).filter(
          (el) => el.tagName === "TR"
        ) as HTMLTableRowElement[])
      );
    } else if (child.tagName === "TR") {
      allBodySourceRows.push(child as HTMLTableRowElement);
    }
  }
  // Fallback if rows weren't captured above.
  if (allBodySourceRows.length === 0 && directRows.length > 0) {
    allBodySourceRows.push(...directRows);
  }

  let headerRows: HTMLTableRowElement[] = [];
  let hasExplicitThead = false;
  let bodyRows: HTMLTableRowElement[] = allBodySourceRows;

  if (thead && thead.rows.length > 0) {
    const candidateHeaders = Array.from(thead.rows);
    const totalHeaderH = candidateHeaders.reduce(
      (sum, r) => sum + measureUnscaledHeight(r, scaleY),
      0
    );
    if (totalHeaderH <= availableContentHeight * 0.4) {
      headerRows = candidateHeaders;
      hasExplicitThead = true;
    } else {
      bodyRows = [...candidateHeaders, ...allBodySourceRows];
    }
  } else if (
    detectImplicitHeaderRow(allBodySourceRows, availableContentHeight, scaleY)
  ) {
    headerRows = [allBodySourceRows[0]];
    bodyRows = allBodySourceRows.slice(1);
  }

  const footerRows = tfoot ? Array.from(tfoot.rows) : [];
  const bodyGroups = groupRowsByRowSpan(bodyRows);

  return {
    colgroup,
    headerRows,
    hasExplicitThead,
    hadTbody: tbodies.length > 0,
    bodyGroups,
    footerRows,
  };
}

function buildTableFragment(
  templateTable: HTMLTableElement,
  parts: TableParts,
  groupsToInclude: HTMLTableRowElement[][],
  isContinuation: boolean,
  isLastFragment: boolean
): HTMLTableElement {
  const frag = templateTable.cloneNode(false) as HTMLTableElement;
  if (isContinuation) {
    frag.removeAttribute("id");
    frag.setAttribute("data-docx-continued", "true");
  }

  if (parts.colgroup) {
    const cg = parts.colgroup.cloneNode(true) as HTMLElement;
    stripDuplicateIds(cg);
    frag.appendChild(cg);
  }

  if (parts.headerRows.length > 0) {
    const headerContainer = parts.hasExplicitThead
      ? document.createElement("thead")
      : parts.hadTbody
      ? document.createElement("tbody")
      : null;

    for (const hRow of parts.headerRows) {
      const node = isContinuation
        ? (hRow.cloneNode(true) as HTMLTableRowElement)
        : hRow;
      if (isContinuation) {
        stripDuplicateIds(node);
      }
      if (headerContainer) {
        headerContainer.appendChild(node);
      } else {
        frag.appendChild(node);
      }
    }

    if (headerContainer) {
      frag.appendChild(headerContainer);
    }
  }

  const bodyContainer = parts.hadTbody ? document.createElement("tbody") : null;
  for (const group of groupsToInclude) {
    for (const row of group) {
      if (bodyContainer) {
        bodyContainer.appendChild(row);
      } else {
        frag.appendChild(row);
      }
    }
  }
  if (bodyContainer) {
    frag.appendChild(bodyContainer);
  }

  if (isLastFragment && parts.footerRows.length > 0) {
    const tfoot = document.createElement("tfoot");
    for (const fRow of parts.footerRows) {
      tfoot.appendChild(fRow);
    }
    frag.appendChild(tfoot);
  }

  return frag;
}

function constrainOversizedMedia(
  block: HTMLElement,
  availableContentHeight: number,
  scaleY: number
): void {
  const maxMediaHeight = Math.max(120, Math.floor(availableContentHeight - 16));
  const mediaNodes = block.querySelectorAll<HTMLElement>("img, svg, canvas");
  for (const media of Array.from(mediaNodes)) {
    const h = measureUnscaledHeight(media, scaleY);
    if (h > maxMediaHeight) {
      media.style.maxHeight = `${maxMediaHeight}px`;
      media.style.maxWidth = "100%";
      if (media.tagName === "IMG") {
        media.style.width = "auto";
        media.style.height = "auto";
        media.style.objectFit = "contain";
      }
    }
  }
}

function isSplittablePlainDiv(
  el: HTMLElement,
  availableContentHeight: number,
  metrics: BlockMetrics
): boolean {
  if (el.tagName !== "DIV") return false;
  if (metrics.height <= availableContentHeight) return false;
  if (el.children.length < 2) return false;

  const cs = getComputedStyle(el);
  if (cs.display !== "block" && cs.display !== "flex") return false;
  if (cs.display === "flex" && cs.flexDirection !== "column") return false;
  if (cs.position === "absolute" || cs.position === "fixed") return false;
  if (!isTransparentColor(cs.backgroundColor)) return false;

  const hasBorder =
    (parseFloat(cs.borderTopWidth) || 0) > 0 ||
    (parseFloat(cs.borderBottomWidth) || 0) > 0 ||
    (parseFloat(cs.borderLeftWidth) || 0) > 0 ||
    (parseFloat(cs.borderRightWidth) || 0) > 0;
  if (hasBorder) return false;

  return true;
}

function pageHasMeaningfulContent(page: HTMLElement): boolean {
  const articles = Array.from(page.querySelectorAll(":scope > article"));
  for (const article of articles) {
    if ((article.textContent?.trim().length ?? 0) > 0) return true;
    if (article.querySelector("img, svg, table, hr, iframe, canvas")) return true;
    for (const child of Array.from(article.children)) {
      if ((child as HTMLElement).offsetHeight > 0) return true;
    }
  }
  return false;
}

function isMultiColumnArticle(article: HTMLElement): number {
  const cs = getComputedStyle(article);
  const count = parseInt(cs.columnCount, 10);
  return Number.isFinite(count) && count > 1 ? count : 1;
}

/**
 * Paginate all overflowing `<section class="docx">` elements inside `container`.
 */
export function paginateDocxContainer(
  container: HTMLElement,
  options: PaginationOptions = {}
): PaginationResult {
  const fallbackPageHeightPx = options.fallbackPageHeightPx ?? A4_HEIGHT_PX;
  const fallbackPageWidthPx = options.fallbackPageWidthPx ?? A4_WIDTH_PX;
  const overflowTolerancePx =
    options.overflowTolerancePx ?? DEFAULT_OVERFLOW_TOLERANCE_PX;
  const maxPagesPerSection =
    options.maxPagesPerSection ?? DEFAULT_MAX_PAGES_PER_SECTION;

  const wrapper =
    (container.querySelector(".docx-wrapper") as HTMLElement | null) ?? container;

  const rawSections = Array.from(
    wrapper.querySelectorAll<HTMLElement>(":scope > section.docx")
  );
  const sections =
    rawSections.length > 0
      ? rawSections
      : Array.from(wrapper.querySelectorAll<HTMLElement>(":scope > section"));

  if (sections.length === 0) {
    return {
      pageCount: 0,
      originalSectionCount: 0,
      splitSectionCount: 0,
      pageWidthPx: 0,
      pageHeightPx: 0,
    };
  }

  const scaleY = getCssScaleY(sections[0]);
  let splitSectionCount = 0;

  for (const section of sections) {
    const cs = getComputedStyle(section);
    let targetWidthPx =
      parsePx(cs.width) ?? (section.offsetWidth > 100 ? section.offsetWidth : fallbackPageWidthPx);
    let targetHeightPx = parsePx(cs.minHeight);

    if (!targetHeightPx || targetHeightPx < 120) {
      // Infer orientation if width is wider than portrait A4.
      targetHeightPx =
        targetWidthPx > 920 ? fallbackPageWidthPx : fallbackPageHeightPx;
      section.style.minHeight = `${targetHeightPx}px`;
    }
    if (!parsePx(section.style.width) && !parsePx(cs.width)) {
      section.style.width = `${targetWidthPx}px`;
    }

    const actualHeightPx = Math.max(
      measureUnscaledHeight(section, scaleY),
      section.offsetHeight,
      section.scrollHeight
    );

    if (actualHeightPx <= targetHeightPx + overflowTolerancePx) {
      continue;
    }

    splitSectionCount++;
    paginateSingleSection(
      wrapper,
      section,
      targetHeightPx,
      scaleY,
      overflowTolerancePx,
      maxPagesPerSection
    );
  }

  const finalPages = Array.from(
    wrapper.querySelectorAll<HTMLElement>(":scope > section.docx")
  );
  const annotatedPages =
    finalPages.length > 0
      ? finalPages
      : Array.from(wrapper.querySelectorAll<HTMLElement>(":scope > section"));

  const totalPages = annotatedPages.length;
  for (let i = 0; i < totalPages; i++) {
    annotatedPages[i].setAttribute("data-onedoc-page", String(i + 1));
    annotatedPages[i].setAttribute("data-onedoc-total-pages", String(totalPages));
  }

  wrapper.setAttribute("data-onedoc-paginated", "true");

  const firstPage = annotatedPages[0];
  const pageWidthPx = firstPage
    ? Math.max(firstPage.offsetWidth, parsePx(getComputedStyle(firstPage).width) ?? 0)
    : fallbackPageWidthPx;
  const pageHeightPx = firstPage
    ? Math.max(
        parsePx(getComputedStyle(firstPage).minHeight) ?? 0,
        firstPage.offsetHeight
      )
    : fallbackPageHeightPx;

  return {
    pageCount: totalPages,
    originalSectionCount: sections.length,
    splitSectionCount,
    pageWidthPx,
    pageHeightPx,
  };
}

function paginateSingleSection(
  wrapper: HTMLElement,
  section: HTMLElement,
  targetHeightPx: number,
  scaleY: number,
  overflowTolerancePx: number,
  maxPagesPerSection: number
): void {
  const cs = getComputedStyle(section);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const borderTop = parseFloat(cs.borderTopWidth) || 0;
  const borderBottom = parseFloat(cs.borderBottomWidth) || 0;

  let headerEl: HTMLElement | null = null;
  let footerEl: HTMLElement | null = null;
  const articles: HTMLElement[] = [];
  const trailingNotes: HTMLElement[] = [];

  for (const child of Array.from(section.children) as HTMLElement[]) {
    if (child.tagName === "HEADER" && !headerEl) {
      headerEl = child;
    } else if (child.tagName === "FOOTER" && !footerEl) {
      footerEl = child;
    } else if (child.tagName === "ARTICLE") {
      articles.push(child);
    } else {
      trailingNotes.push(child);
    }
  }

  if (articles.length === 0) {
    return;
  }

  const headerConsume = measureFlexChildConsumption(headerEl, scaleY);
  const footerConsume = measureFlexChildConsumption(footerEl, scaleY);
  const availableContentHeight = Math.max(
    120,
    targetHeightPx -
      padTop -
      padBottom -
      borderTop -
      borderBottom -
      headerConsume -
      footerConsume
  );

  const bodyFontSize = estimateBodyFontSize(section);

  // Pre-measure every article's direct children in a single read pass before mutating DOM.
  const metricsMap = new Map<HTMLElement, BlockMetrics>();
  const articleQueues: {
    template: HTMLElement;
    columnCount: number;
    children: HTMLElement[];
  }[] = [];

  for (const art of articles) {
    const colCount = isMultiColumnArticle(art);
    const children = Array.from(art.children) as HTMLElement[];
    for (const child of children) {
      metricsMap.set(child, measureBlock(child, scaleY));
    }
    articleQueues.push({ template: art, columnCount: colCount, children });
  }

  const pages: PageContext[] = [];
  const movedHeadings = new WeakSet<HTMLElement>();

  const createPage = (articleTemplate: HTMLElement): PageContext => {
    const isFirst = pages.length === 0;
    const page = section.cloneNode(false) as HTMLElement;
    if (!isFirst) {
      page.removeAttribute("id");
    }
    page.style.minHeight = `${targetHeightPx}px`;

    if (headerEl) {
      const hNode = isFirst
        ? headerEl
        : (headerEl.cloneNode(true) as HTMLElement);
      if (!isFirst) stripDuplicateIds(hNode);
      page.appendChild(hNode);
    }

    const article = articleTemplate.cloneNode(false) as HTMLElement;
    article.removeAttribute("id");
    page.appendChild(article);

    let footerNode: HTMLElement | null = null;
    if (footerEl) {
      footerNode = isFirst
        ? footerEl
        : (footerEl.cloneNode(true) as HTMLElement);
      if (!isFirst) stripDuplicateIds(footerNode);
      page.appendChild(footerNode);
    }

    wrapper.insertBefore(page, section);

    const ctx: PageContext = {
      page,
      article,
      footer: footerNode,
      usedHeight: 0,
      prevMarginBottom: 0,
      itemCount: 0,
    };
    pages.push(ctx);
    return ctx;
  };

  let currentPage: PageContext = createPage(articleQueues[0].template);

  const projectHeightAfterAdding = (
    ctx: PageContext,
    m: BlockMetrics
  ): number => {
    if (m.isFloating) return ctx.usedHeight + ctx.prevMarginBottom;
    if (ctx.itemCount === 0) {
      return m.marginTop + m.height + m.marginBottom;
    }
    return (
      ctx.usedHeight +
      collapseMargins(ctx.prevMarginBottom, m.marginTop) +
      m.height +
      m.marginBottom
    );
  };

  const commitBlockToCurrentPage = (
    el: HTMLElement,
    m: BlockMetrics
  ): void => {
    currentPage.article.appendChild(el);
    if (m.isFloating) return;
    if (currentPage.itemCount === 0) {
      currentPage.usedHeight = m.marginTop + m.height;
    } else {
      currentPage.usedHeight +=
        collapseMargins(currentPage.prevMarginBottom, m.marginTop) + m.height;
    }
    currentPage.prevMarginBottom = m.marginBottom;
    currentPage.itemCount++;
  };

  const recomputeCurrentPageMetrics = (): void => {
    let used = 0;
    let prevMb = 0;
    let count = 0;
    for (const child of Array.from(currentPage.article.children) as HTMLElement[]) {
      const m = metricsMap.get(child) ?? measureBlock(child, scaleY);
      if (m.isFloating) continue;
      if (count === 0) {
        used = m.marginTop + m.height;
      } else {
        used += collapseMargins(prevMb, m.marginTop) + m.height;
      }
      prevMb = m.marginBottom;
      count++;
    }
    currentPage.usedHeight = used;
    currentPage.prevMarginBottom = prevMb;
    currentPage.itemCount = count;
  };

  const isCurrentPageOverflowing = (): boolean => {
    const actualH = Math.max(
      measureUnscaledHeight(currentPage.page, scaleY),
      currentPage.page.offsetHeight
    );
    return actualH > targetHeightPx + overflowTolerancePx;
  };

  const remainingHeightOnCurrentPage = (): number => {
    const consumed =
      currentPage.itemCount === 0
        ? 0
        : currentPage.usedHeight + currentPage.prevMarginBottom;
    return Math.max(0, availableContentHeight - consumed);
  };

  const pullTrailingHeadingsToQueue = (
    nextEl: HTMLElement | null,
    queue: HTMLElement[]
  ): number => {
    let pulled = 0;
    const pulledElements: HTMLElement[] = [];

    while (pulled < 2 && currentPage.article.children.length > 1) {
      const last = currentPage.article.lastElementChild as HTMLElement | null;
      if (!last || movedHeadings.has(last)) break;

      const lookahead = pulledElements.length > 0 ? pulledElements[0] : nextEl;
      if (!isHeadingOrKeepWithNext(last, lookahead, bodyFontSize)) {
        break;
      }

      currentPage.article.removeChild(last);
      movedHeadings.add(last);
      pulledElements.unshift(last);
      pulled++;
    }

    if (pulledElements.length > 0) {
      recomputeCurrentPageMetrics();
      for (let i = pulledElements.length - 1; i >= 0; i--) {
        queue.unshift(pulledElements[i]);
      }
    }
    return pulledElements.length;
  };

  const settleCurrentPageOverflow = (queue: HTMLElement[]): number => {
    let popped = 0;
    while (
      popped < 8 &&
      currentPage.article.children.length > 1 &&
      isCurrentPageOverflowing()
    ) {
      const last = currentPage.article.lastElementChild as HTMLElement | null;
      if (!last) break;
      currentPage.article.removeChild(last);
      queue.unshift(last);
      recomputeCurrentPageMetrics();
      popped++;
    }
    return popped;
  };

  const paginateTable = (
    table: HTMLTableElement,
    tableMetrics: BlockMetrics,
    articleTemplate: HTMLElement,
    queue: HTMLElement[]
  ): void => {
    const parts = extractTableParts(table, availableContentHeight, scaleY);
    if (parts.bodyGroups.length === 0) {
      // Degenerate or header-only table: place atomically.
      if (currentPage.itemCount > 0) {
        pullTrailingHeadingsToQueue(table, queue);
        settleCurrentPageOverflow(queue);
        if (pages.length < maxPagesPerSection) {
          currentPage = createPage(articleTemplate);
        }
      }
      commitBlockToCurrentPage(table, tableMetrics);
      return;
    }

    const headerHeight = parts.headerRows.reduce(
      (sum, r) => sum + measureUnscaledHeight(r, scaleY),
      0
    );
    const footerHeight = parts.footerRows.reduce(
      (sum, r) => sum + measureUnscaledHeight(r, scaleY),
      0
    );
    const groupHeights = parts.bodyGroups.map((group) =>
      group.reduce((sum, r) => sum + measureUnscaledHeight(r, scaleY), 0)
    );

    const borderOverhead = 4;

    // Check if header + first row-group can start on the current non-empty page.
    if (currentPage.itemCount > 0) {
      const firstChunkNeeded =
        collapseMargins(currentPage.prevMarginBottom, tableMetrics.marginTop) +
        headerHeight +
        groupHeights[0] +
        borderOverhead;
      const availableHere =
        availableContentHeight - currentPage.usedHeight;
      if (firstChunkNeeded > availableHere + overflowTolerancePx) {
        const pulledHeadings = pullTrailingHeadingsToQueue(table, queue);
        const settledOverflow = settleCurrentPageOverflow(queue);
        const totalPrepended = pulledHeadings + settledOverflow;
        if (totalPrepended > 0) {
          // Preserve exact document order: pulled caption/heading stays directly before table.
          queue.splice(totalPrepended, 0, table);
          if (pages.length < maxPagesPerSection) {
            currentPage = createPage(articleTemplate);
          }
          return;
        }
        if (pages.length < maxPagesPerSection) {
          currentPage = createPage(articleTemplate);
        }
      }
    }

    let groupIdx = 0;
    let fragmentIndex = 0;

    while (
      groupIdx < parts.bodyGroups.length &&
      pages.length <= maxPagesPerSection
    ) {
      const hadPriorPageContent = currentPage.itemCount > 0;
      const isContinuation = fragmentIndex > 0;
      const startBudget =
        !hadPriorPageContent
          ? availableContentHeight - tableMetrics.marginTop - borderOverhead
          : availableContentHeight -
            currentPage.usedHeight -
            collapseMargins(
              currentPage.prevMarginBottom,
              isContinuation ? 0 : tableMetrics.marginTop
            ) -
            borderOverhead;

      let usedInFrag = headerHeight;
      const chosenIndices: number[] = [];

      while (groupIdx < parts.bodyGroups.length) {
        const gH = groupHeights[groupIdx];
        const isLast = groupIdx === parts.bodyGroups.length - 1;
        const extraFoot = isLast ? footerHeight : 0;

        if (
          usedInFrag + gH + extraFoot <= startBudget + overflowTolerancePx ||
          (chosenIndices.length === 0 && !hadPriorPageContent)
        ) {
          chosenIndices.push(groupIdx);
          usedInFrag += gH;
          groupIdx++;
        } else {
          break;
        }
      }

      if (chosenIndices.length === 0) {
        // Current page had prior content and couldn't fit even 1 row-group: open fresh page.
        if (pages.length >= maxPagesPerSection) {
          chosenIndices.push(groupIdx++);
        } else {
          settleCurrentPageOverflow(queue);
          currentPage = createPage(articleTemplate);
          continue;
        }
      }

      const isLastFragment = groupIdx >= parts.bodyGroups.length;
      const chosenGroups = chosenIndices.map((i) => parts.bodyGroups[i]);
      const frag = buildTableFragment(
        table,
        parts,
        chosenGroups,
        isContinuation,
        isLastFragment
      );
      if (isContinuation) {
        frag.style.marginTop = "0px";
      }

      currentPage.article.appendChild(frag);

      // Live verification: if this fragment still overflowed the page and has >1 row-group,
      // pop trailing row-groups back to the next page until it fits cleanly.
      while (chosenIndices.length > 1 && isCurrentPageOverflowing()) {
        const poppedIdx = chosenIndices.pop()!;
        groupIdx = poppedIdx;
        const poppedGroup = parts.bodyGroups[poppedIdx];
        for (const r of poppedGroup) {
          r.parentElement?.removeChild(r);
        }
        const existingTfoot = frag.querySelector(":scope > tfoot");
        if (existingTfoot) {
          existingTfoot.remove();
        }
      }

      // If this page had prior content and even 1 row-group overflowed it, move the fragment to a fresh page.
      if (
        chosenIndices.length === 1 &&
        hadPriorPageContent &&
        isCurrentPageOverflowing() &&
        pages.length < maxPagesPerSection
      ) {
        groupIdx = chosenIndices[0];
        frag.remove();
        recomputeCurrentPageMetrics();
        currentPage = createPage(articleTemplate);
        continue;
      }

      // If this was the sole element on a fresh page and still overflows because of giant media in a cell, constrain media.
      if (chosenIndices.length === 1 && !hadPriorPageContent && isCurrentPageOverflowing()) {
        constrainOversizedMedia(frag, availableContentHeight, scaleY);
      }

      const fragMetrics = measureBlock(frag, scaleY);
      metricsMap.set(frag, fragMetrics);
      recomputeCurrentPageMetrics();

      fragmentIndex++;

      if (groupIdx < parts.bodyGroups.length) {
        if (pages.length < maxPagesPerSection) {
          currentPage = createPage(articleTemplate);
        } else {
          break;
        }
      }
    }
  };

  const paginateList = (
    listEl: HTMLUListElement | HTMLOListElement,
    listMetrics: BlockMetrics,
    articleTemplate: HTMLElement,
    queue: HTMLElement[]
  ): void => {
    const items = Array.from(listEl.children).filter(
      (c) => c.tagName === "LI"
    ) as HTMLLIElement[];
    if (items.length < 2) {
      if (currentPage.itemCount > 0) {
        pullTrailingHeadingsToQueue(listEl, queue);
        settleCurrentPageOverflow(queue);
        if (pages.length < maxPagesPerSection) {
          currentPage = createPage(articleTemplate);
        }
      }
      commitBlockToCurrentPage(listEl, listMetrics);
      return;
    }

    const itemMetrics = items.map((li) => measureBlock(li, scaleY));
    const isOrdered = listEl.tagName === "OL";
    let nextOlNumber = isOrdered
      ? (listEl as HTMLOListElement).start || 1
      : 1;

    // Check if at least the first item fits on the current non-empty page.
    if (currentPage.itemCount > 0) {
      const firstItemH =
        collapseMargins(currentPage.prevMarginBottom, listMetrics.marginTop) +
        itemMetrics[0].marginTop +
        itemMetrics[0].height +
        itemMetrics[0].marginBottom;
      if (firstItemH > availableContentHeight - currentPage.usedHeight + overflowTolerancePx) {
        const pulledHeadings = pullTrailingHeadingsToQueue(listEl, queue);
        const settledOverflow = settleCurrentPageOverflow(queue);
        const totalPrepended = pulledHeadings + settledOverflow;
        if (totalPrepended > 0) {
          queue.splice(totalPrepended, 0, listEl);
          if (pages.length < maxPagesPerSection) {
            currentPage = createPage(articleTemplate);
          }
          return;
        }
        if (pages.length < maxPagesPerSection) {
          currentPage = createPage(articleTemplate);
        }
      }
    }

    let idx = 0;
    let fragmentIndex = 0;

    while (idx < items.length && pages.length <= maxPagesPerSection) {
      const hadPriorPageContent = currentPage.itemCount > 0;
      const isContinuation = fragmentIndex > 0;
      const startBudget =
        !hadPriorPageContent
          ? availableContentHeight - (isContinuation ? 0 : listMetrics.marginTop)
          : availableContentHeight -
            currentPage.usedHeight -
            collapseMargins(
              currentPage.prevMarginBottom,
              isContinuation ? 0 : listMetrics.marginTop
            );

      const chosenIndices: number[] = [];
      let fragUsed = 0;
      let fragPrevMb = 0;

      while (idx < items.length) {
        const m = itemMetrics[idx];
        const nextTotal =
          chosenIndices.length === 0
            ? m.marginTop + m.height + m.marginBottom
            : fragUsed + collapseMargins(fragPrevMb, m.marginTop) + m.height + m.marginBottom;

        if (
          nextTotal <= startBudget + overflowTolerancePx ||
          (chosenIndices.length === 0 && !hadPriorPageContent)
        ) {
          if (chosenIndices.length === 0) {
            fragUsed = m.marginTop + m.height;
          } else {
            fragUsed += collapseMargins(fragPrevMb, m.marginTop) + m.height;
          }
          fragPrevMb = m.marginBottom;
          chosenIndices.push(idx);
          idx++;
        } else {
          break;
        }
      }

      if (chosenIndices.length === 0) {
        if (pages.length >= maxPagesPerSection) {
          chosenIndices.push(idx++);
        } else {
          settleCurrentPageOverflow(queue);
          currentPage = createPage(articleTemplate);
          continue;
        }
      }

      const frag = listEl.cloneNode(false) as HTMLUListElement | HTMLOListElement;
      if (isContinuation) {
        frag.removeAttribute("id");
        frag.setAttribute("data-docx-continued", "true");
        frag.style.marginTop = "0px";
      }
      if (isOrdered) {
        (frag as HTMLOListElement).start = nextOlNumber;
      }

      const startNumberForFrag = nextOlNumber;
      for (const itemIdx of chosenIndices) {
        const li = items[itemIdx];
        if (isOrdered && li.hasAttribute("value")) {
          const explicitVal = parseInt(li.getAttribute("value") || "", 10);
          if (Number.isFinite(explicitVal)) {
            nextOlNumber = explicitVal + 1;
          } else {
            nextOlNumber++;
          }
        } else {
          nextOlNumber++;
        }
        frag.appendChild(li);
      }

      currentPage.article.appendChild(frag);

      // Live overflow verification for this list fragment.
      while (chosenIndices.length > 1 && isCurrentPageOverflowing()) {
        const poppedIdx = chosenIndices.pop()!;
        idx = poppedIdx;
        const poppedLi = items[poppedIdx];
        poppedLi.parentElement?.removeChild(poppedLi);
      }

      // If prior content on the page caused even 1 <li> to overflow, move this fragment to a fresh page.
      if (
        chosenIndices.length === 1 &&
        hadPriorPageContent &&
        isCurrentPageOverflowing() &&
        pages.length < maxPagesPerSection
      ) {
        idx = chosenIndices[0];
        nextOlNumber = startNumberForFrag;
        frag.remove();
        recomputeCurrentPageMetrics();
        currentPage = createPage(articleTemplate);
        continue;
      }

      // Recompute exact nextOlNumber after any live pop-back.
      if (isOrdered) {
        nextOlNumber = startNumberForFrag;
        for (const itemIdx of chosenIndices) {
          const li = items[itemIdx];
          if (li.hasAttribute("value")) {
            const explicitVal = parseInt(li.getAttribute("value") || "", 10);
            nextOlNumber = Number.isFinite(explicitVal)
              ? explicitVal + 1
              : nextOlNumber + 1;
          } else {
            nextOlNumber++;
          }
        }
      }

      if (chosenIndices.length === 1 && !hadPriorPageContent && isCurrentPageOverflowing()) {
        constrainOversizedMedia(frag, availableContentHeight, scaleY);
      }

      const fragMetrics = measureBlock(frag, scaleY);
      metricsMap.set(frag, fragMetrics);
      recomputeCurrentPageMetrics();
      fragmentIndex++;

      if (idx < items.length) {
        if (pages.length < maxPagesPerSection) {
          currentPage = createPage(articleTemplate);
        } else {
          break;
        }
      }
    }
  };

  // Paginate each <article> inside the original section.
  for (let artIdx = 0; artIdx < articleQueues.length; artIdx++) {
    const { template: articleTemplate, columnCount, children } =
      articleQueues[artIdx];

    if (artIdx > 0) {
      // Subsequent <article> in the same original section (continuous section break).
      const remaining = remainingHeightOnCurrentPage();
      if (remaining > 60 && currentPage.itemCount > 0) {
        const nextArticle = articleTemplate.cloneNode(false) as HTMLElement;
        nextArticle.removeAttribute("id");
        if (currentPage.footer) {
          currentPage.page.insertBefore(nextArticle, currentPage.footer);
        } else {
          currentPage.page.appendChild(nextArticle);
        }
        currentPage.article = nextArticle;
      } else if (currentPage.itemCount > 0 && pages.length < maxPagesPerSection) {
        currentPage = createPage(articleTemplate);
      }
    }

    // For multi-column articles, scale effective vertical flow budget by column count.
    const effectiveArticleBudget =
      columnCount > 1
        ? availableContentHeight * columnCount
        : availableContentHeight;

    const queue = [...children];

    while (queue.length > 0 && pages.length <= maxPagesPerSection) {
      const el = queue.shift()!;
      const m = metricsMap.get(el) ?? measureBlock(el, scaleY);

      if (m.isFloating) {
        commitBlockToCurrentPage(el, m);
        continue;
      }

      // Skip zero-height empty noise nodes at the very top of a fresh page.
      if (m.isEmptyNoise && currentPage.itemCount === 0 && queue.length === 0) {
        continue;
      }

      const projected = projectHeightAfterAdding(currentPage, m);
      if (projected <= effectiveArticleBudget + overflowTolerancePx) {
        commitBlockToCurrentPage(el, m);
        continue;
      }

      // Element does not fit cleanly on currentPage.
      if (el.tagName === "TABLE" && columnCount === 1) {
        paginateTable(el as HTMLTableElement, m, articleTemplate, queue);
        continue;
      }

      if (
        (el.tagName === "UL" || el.tagName === "OL") &&
        columnCount === 1
      ) {
        paginateList(
          el as HTMLUListElement | HTMLOListElement,
          m,
          articleTemplate,
          queue
        );
        continue;
      }

      if (isSplittablePlainDiv(el, availableContentHeight, m) && columnCount === 1) {
        const subChildren = Array.from(el.children) as HTMLElement[];
        for (const sub of subChildren) {
          if (!metricsMap.has(sub)) {
            metricsMap.set(sub, measureBlock(sub, scaleY));
          }
        }
        queue.unshift(...subChildren);
        continue;
      }

      if (currentPage.itemCount > 0) {
        // Move trailing orphan heading(s) along with this block to the next page.
        const pulledHeadings = pullTrailingHeadingsToQueue(el, queue);
        const settledOverflow = settleCurrentPageOverflow(queue);
        const totalPrepended = pulledHeadings + settledOverflow;

        // Place `el` right after any pulled headings/settled blocks at the start of the queue.
        queue.splice(totalPrepended, 0, el);

        if (pages.length < maxPagesPerSection) {
          currentPage = createPage(articleTemplate);
          continue;
        }
      }

      // Current page is empty (or hit maxPagesPerSection): place oversized atomic block
      // unconditionally to guarantee forward progress and prevent infinite loops.
      constrainOversizedMedia(el, availableContentHeight, scaleY);
      commitBlockToCurrentPage(el, measureBlock(el, scaleY));
    }

    // Final live check on the last page populated by this article.
    if (columnCount === 1 && currentPage.article.children.length > 1) {
      const overflowTail: HTMLElement[] = [];
      settleCurrentPageOverflow(overflowTail);
      if (overflowTail.length > 0 && pages.length < maxPagesPerSection) {
        currentPage = createPage(articleTemplate);
        for (const tailEl of overflowTail) {
          commitBlockToCurrentPage(
            tailEl,
            metricsMap.get(tailEl) ?? measureBlock(tailEl, scaleY)
          );
        }
      }
    }
  }

  // Re-attach footnotes / endnotes (<ol> or note sections) cleanly on the last page.
  if (trailingNotes.length > 0) {
    for (const noteEl of trailingNotes) {
      if (currentPage.footer) {
        currentPage.page.insertBefore(noteEl, currentPage.footer);
      } else {
        currentPage.page.appendChild(noteEl);
      }
      if (
        isCurrentPageOverflowing() &&
        currentPage.itemCount > 0 &&
        pages.length < maxPagesPerSection
      ) {
        noteEl.remove();
        currentPage = createPage(articleQueues[articleQueues.length - 1].template);
        if (currentPage.footer) {
          currentPage.page.insertBefore(noteEl, currentPage.footer);
        } else {
          currentPage.page.appendChild(noteEl);
        }
      }
    }
  }

  // Prune any completely empty trailing page created by trailing whitespace/noise.
  while (pages.length > 1) {
    const lastCtx = pages[pages.length - 1];
    if (!pageHasMeaningfulContent(lastCtx.page) && trailingNotes.length === 0) {
      lastCtx.page.remove();
      pages.pop();
    } else {
      break;
    }
  }

  // Remove the drained original section now that all its paginated sheets are in place.
  section.remove();
}
