import type { Commit, CommitsByDate, WorkStatusMetricsConfig } from '../../../../types/gitStatistics';

const POSTER_WIDTH = 960;
const SHEET_X = 24;
const SHEET_WIDTH = POSTER_WIDTH - SHEET_X * 2;
const CONTENT_X = 52;
const CONTENT_WIDTH = POSTER_WIDTH - CONTENT_X * 2;
const RECORD_ROW_X = 112;
const RECORD_ROW_WIDTH = POSTER_WIDTH - RECORD_ROW_X - SHEET_X - 8;
const BODY_FONT = 'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif';
const DISPLAY_FONT = 'Songti SC, Noto Serif SC, STSong, SimSun, serif';

const REPO_TONES = [
  { fill: '#E8F1FF', stroke: '#1677FF', text: '#103B73' },
  { fill: '#EAF7EA', stroke: '#52C41A', text: '#215721' },
  { fill: '#FFF3E8', stroke: '#FA8C16', text: '#7A3E00' },
  { fill: '#E7FAFA', stroke: '#13C2C2', text: '#0F6666' },
  { fill: '#F1EAFF', stroke: '#722ED1', text: '#43226D' },
  { fill: '#FFEAF3', stroke: '#EB2F96', text: '#7F184F' },
  { fill: '#FFF1F0', stroke: '#F5222D', text: '#7A1216' },
  { fill: '#FFF4E8', stroke: '#FA541C', text: '#7A2E10' },
  { fill: '#FFFBE6', stroke: '#FAAD14', text: '#7A5910' },
  { fill: '#F6FFED', stroke: '#A0D911', text: '#3C5B10' },
] as const;

type Tone = (typeof REPO_TONES)[number];

interface ChipSpec {
  text: string;
  fill: string;
  stroke: string;
  textColor: string;
}

interface PlacedChip extends ChipSpec {
  x: number;
  y: number;
  width: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).format(new Date(`${date}T00:00:00+08:00`));
}

function formatCommitTime(commitDate: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(commitDate));
}

function charUnits(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (char === ' ') return 0.3;
  if (code <= 0x007f) {
    if (/[A-Za-z0-9]/.test(char)) return 0.58;
    return 0.42;
  }
  if (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x3000 && code <= 0x303f)
  ) {
    return 1;
  }
  return 0.8;
}

function textUnits(text: string): number {
  return [...text].reduce((sum, char) => sum + charUnits(char), 0);
}

function wrapText(text: string, maxUnits: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return ['(无 message)'];

  const lines: string[] = [];
  for (const paragraph of normalized.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    let current = '';
    let currentUnits = 0;
    for (const char of [...paragraph]) {
      const units = charUnits(char);
      if (current && currentUnits + units > maxUnits) {
        lines.push(current);
        current = char;
        currentUnits = units;
      } else {
        current += char;
        currentUnits += units;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : ['(无 message)'];
}

function repoTone(index: number): Tone {
  return REPO_TONES[index % REPO_TONES.length];
}

type CommitCategory = 'feature' | 'optimize' | 'release' | 'merge';

const COMMIT_CATEGORY_TONES: Record<CommitCategory, { label: string; stroke: string; fill: string; text: string }> = {
  feature: { label: '功能 / 修复', stroke: '#1677FF', fill: '#EEF4FF', text: '#10408A' },
  optimize: { label: '优化 / 变更', stroke: '#52C41A', fill: '#EEF8EF', text: '#25603B' },
  release: { label: '发布 / 维护', stroke: '#FA8C16', fill: '#FFF3E8', text: '#8A4A00' },
  merge: { label: '合并 / 重要', stroke: '#F5222D', fill: '#FFF0F0', text: '#8A1F29' },
};

function commitCategory(commit: Commit): CommitCategory {
  const message = commit.message.toLowerCase();
  if (/merge|合并|重要/.test(message)) return 'merge';
  if (/release|发布|上线|版本|维护|chore/.test(message)) return 'release';
  if (/refactor|optimi[sz]|优化|变更|调整|重构|perf/.test(message)) return 'optimize';
  return 'feature';
}

function semanticTone(token: string): { fill: string; stroke: string; text: string } {
  const tones: Record<string, { fill: string; stroke: string; text: string }> = {
    default: { fill: '#F5F5F5', stroke: '#D9D9D9', text: '#4B5563' },
    processing: { fill: '#E8F1FF', stroke: '#9DBDF5', text: '#10408A' },
    success: { fill: '#EEF8EF', stroke: '#B9DEBF', text: '#25603B' },
    warning: { fill: '#FFF7D6', stroke: '#E0C15A', text: '#7A5A00' },
    error: { fill: '#FFF0F0', stroke: '#F2B3B6', text: '#8A1F29' },
    magenta: { fill: '#FFEAF3', stroke: '#F0B3D2', text: '#7F184F' },
    red: { fill: '#FFF0F0', stroke: '#F2B3B6', text: '#8A1F29' },
    volcano: { fill: '#FFF2EA', stroke: '#F3C0AE', text: '#8A3D21' },
    orange: { fill: '#FFF3E8', stroke: '#F3C18D', text: '#8A4A00' },
    gold: { fill: '#FFF9E6', stroke: '#E3D08A', text: '#7A5A00' },
    lime: { fill: '#F6FFEA', stroke: '#C9E6A3', text: '#486B1B' },
    green: { fill: '#EEF8EF', stroke: '#B9DEBF', text: '#25603B' },
    cyan: { fill: '#E7FAFA', stroke: '#A6E0E0', text: '#0F6666' },
    blue: { fill: '#EEF4FF', stroke: '#9DBDF5', text: '#10408A' },
    geekblue: { fill: '#EEF1FF', stroke: '#B5BFEF', text: '#31409A' },
    purple: { fill: '#F1EAFF', stroke: '#C7B5F2', text: '#43226D' },
  };
  return tones[token] ?? tones.default;
}

function buildSummaryChips(group: CommitsByDate, metricsConfig: WorkStatusMetricsConfig | null): ChipSpec[] {
  const statusLabel = metricsConfig?.labels[group.workStatus] ?? group.workStatus;
  const statusTone = semanticTone(metricsConfig?.colors[group.workStatus] ?? 'default');
  return [
    { text: `日期  ${formatDateLabel(group.date)}`, fill: '#F8F4EC', stroke: '#D9CBB2', textColor: '#3A342C' },
    {
      text: `加班  ${group.overtimeCount} 条`,
      fill: group.overtimeCount > 0 ? '#FFF0F0' : '#EEF8EF',
      stroke: group.overtimeCount > 0 ? '#F2B3B6' : '#B9DEBF',
      textColor: group.overtimeCount > 0 ? '#8A1F29' : '#25603B',
    },
    {
      text: `发版  ${group.hasRelease ? '有' : '无'}`,
      fill: group.hasRelease ? '#FFF7D6' : '#F3F4F6',
      stroke: group.hasRelease ? '#E0C15A' : '#D1D5DB',
      textColor: group.hasRelease ? '#7A5A00' : '#4B5563',
    },
    { text: `状态  ${statusLabel}`, fill: statusTone.fill, stroke: statusTone.stroke, textColor: statusTone.text },
  ];
}

function layoutChips(chips: ChipSpec[], maxWidth: number, chipHeight: number, gapX: number, gapY: number): { placements: PlacedChip[]; height: number } {
  const placements: PlacedChip[] = [];
  let currentX = 0;
  let currentY = 0;
  let rowHeight = chipHeight;

  for (const chip of chips) {
    const width = Math.min(maxWidth, Math.max(96, Math.ceil(textUnits(chip.text) * 16 + 32)));
    if (currentX > 0 && currentX + width > maxWidth) {
      currentX = 0;
      currentY += rowHeight + gapY;
    }
    placements.push({ ...chip, x: currentX, y: currentY, width });
    currentX += width + gapX;
  }

  return { placements, height: placements.length > 0 ? currentY + rowHeight : 0 };
}

function chipMarkup(chip: PlacedChip, originX: number, originY: number, chipHeight: number): string {
  return `
    <g transform="translate(${originX + chip.x}, ${originY + chip.y})">
      <rect width="${chip.width}" height="${chipHeight}" rx="${chipHeight / 2}" fill="${chip.fill}" stroke="${chip.stroke}" stroke-width="1.5" />
      <text x="${chip.width / 2}" y="${chipHeight / 2 + 1}" text-anchor="middle" dominant-baseline="middle" fill="${chip.textColor}" font-family="${BODY_FONT}" font-size="16" font-weight="600">${escapeXml(chip.text)}</text>
    </g>
  `;
}

function iconMarkup(kind: 'overview' | 'repo' | 'records' | 'calendar' | 'clock' | 'tag' | 'status' | 'layers' | 'chart', x: number, y: number, color = '#1677FF'): string {
  const paths: Record<string, string> = {
    overview: '<rect x="3" y="2" width="18" height="20" rx="3"/><path d="M7 7h10M7 11h10M7 15h6"/>',
    repo: '<path d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5Z"/><path d="m4 13 8 4.5 8-4.5M4 17.5 12 22l8-4.5"/>',
    records: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4M9 12h7M9 16h7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="m4 5 8-2 9 9-8 8-9-9V5Z"/><circle cx="8" cy="8" r="1.5"/>',
    status: '<circle cx="12" cy="12" r="8"/><path d="m8 12 3 3 5-6"/>',
    layers: '<path d="m3 8 9-5 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    chart: '<path d="M5 20V11M12 20V5M19 20v-8"/>',
  };
  return `<g transform="translate(${x},${y})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</g>`;
}

function sectionHeading(kind: 'overview' | 'repo' | 'records', text: string, y: number, rightText?: string, placement: 'right' | 'next' = 'right'): string {
  const rightLabel = rightText
    ? placement === 'next'
      ? `<text x="174" y="${y}" fill="#8A8173" font-family="${BODY_FONT}" font-size="14">${escapeXml(rightText)}</text>`
      : `<text x="${POSTER_WIDTH - CONTENT_X}" y="${y}" text-anchor="end" fill="#8A8173" font-family="${BODY_FONT}" font-size="14">${escapeXml(rightText)}</text>`
    : '';
  return `${iconMarkup(kind, CONTENT_X, y - 18)}<text x="82" y="${y}" fill="#17345E" font-family="${BODY_FONT}" font-size="21" font-weight="800">${escapeXml(text)}</text>${rightLabel}`;
}

function renderTextLines(lines: string[], options: {
  x: number;
  y: number;
  fontSize: number;
  lineHeight: number;
  fill: string;
  fontFamily: string;
  fontWeight?: number;
}): string {
  const { x, y, fontSize, lineHeight, fill, fontFamily, fontWeight = 400 } = options;
  const tspans = lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line || ' ')}</tspan>`)
    .join('');
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" xml:space="preserve">${tspans}</text>`;
}

function sortCommitsForPoster(commits: Commit[]): Commit[] {
  return [...commits].sort((a, b) => (
    a.commitDate - b.commitDate ||
    a.createdAt - b.createdAt ||
    a.id - b.id ||
    a.commitHash.localeCompare(b.commitHash)
  ));
}

function buildCommitRowMarkup(commit: Commit, width: number): { markup: string; height: number } {
  const rowWidth = width;
  const leftPadding = 18;
  const rightPadding = 18;
  const timeWidth = 104;
  const hashWidth = 116;
  const messageX = leftPadding + timeWidth + 22;
  const messageWidth = rowWidth - messageX - hashWidth - rightPadding - 18;
  const messageLines = wrapText(commit.message, Math.max(28, Math.floor(messageWidth / 15)));
  const messageLineHeight = 22;
  const rowHeight = Math.max(72, 40 + messageLines.length * messageLineHeight);
  const hash = commit.commitHash.slice(0, 10);
  const categoryTone = COMMIT_CATEGORY_TONES[commitCategory(commit)];
  const accent = commit.isOvertime ? '#F5222D' : categoryTone.stroke;
  const timeFill = commit.isOvertime ? '#FFF0F0' : '#F8FAFC';
  const timeStroke = commit.isOvertime ? '#F2B3B6' : '#D8DEE8';
  const timeText = commit.isOvertime ? '#A8071A' : '#253047';

  const markup = `
    <g>
      <rect width="${rowWidth}" height="${rowHeight}" rx="12" fill="#FFFFFF" stroke="#D6E1EF" stroke-width="1.2" />
      <rect width="5" height="${rowHeight}" rx="2.5" fill="${accent}" />
      <rect x="${leftPadding}" y="14" width="${timeWidth}" height="30" rx="15" fill="${timeFill}" stroke="${timeStroke}" stroke-width="1" />
      <text x="${leftPadding + timeWidth / 2}" y="34" text-anchor="middle" fill="${timeText}" font-family="${BODY_FONT}" font-size="14" font-weight="800">${escapeXml(formatCommitTime(commit.commitDate))}</text>
      <text x="${rowWidth - rightPadding}" y="34" text-anchor="end" fill="#6B7280" font-family="monospace" font-size="13" font-weight="700">${escapeXml(hash)}</text>
      ${renderTextLines(messageLines, {
        x: messageX,
        y: 34,
        fontSize: 16,
        lineHeight: messageLineHeight,
        fill: '#243044',
        fontFamily: BODY_FONT,
        fontWeight: 600,
      })}
    </g>
  `;

  return { markup, height: rowHeight };
}

export function buildCommitDayPosterSvg(group: CommitsByDate, metricsConfig: WorkStatusMetricsConfig | null): { svg: string; width: number; height: number; filename: string } {
  const repositories = group.repositories.length > 0 ? group.repositories : [...new Set(group.commits.map((commit) => commit.repoName))];
  const sortedCommits = sortCommitsForPoster(group.commits);
  const summaryLayout = layoutChips(buildSummaryChips(group, metricsConfig), CONTENT_WIDTH, 42, 12, 12);
  const repoLayout = layoutChips(repositories.map((name, index) => {
    const tone = repoTone(index);
    return { text: name, fill: tone.fill, stroke: tone.stroke, textColor: tone.text };
  }), CONTENT_WIDTH, 36, 10, 10);
  const summaryY = 282;
  const summaryCardY = 238;
  const summaryCardHeight = summaryLayout.height + 60;
  const repoLabelY = summaryCardY + summaryCardHeight + 44;
  const repoY = repoLabelY + 24;
  const repoCardY = repoLabelY - 28;
  const repoCardHeight = repoLayout.height + 56;
  const recordsLabelY = repoCardY + repoCardHeight + 48;
  const recordsY = recordsLabelY + 30;
  const rowGap = 12;
  const rows: string[] = [];
  let cursorY = recordsY;
  const rowHeights: number[] = [];

  for (const commit of sortedCommits) {
    const rendered = buildCommitRowMarkup(commit, RECORD_ROW_WIDTH);
    rows.push(`<g transform="translate(0, ${cursorY})">${rendered.markup}</g>`);
    rowHeights.push(rendered.height);
    cursorY += rendered.height + rowGap;
  }

  const recordsCardY = recordsLabelY - 28;
  const totalHeight = Math.max(cursorY + 48, recordsY + 96);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${totalHeight}" viewBox="0 0 ${POSTER_WIDTH} ${totalHeight}">
      <defs>
        <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#083B9A"/><stop offset="0.55" stop-color="#071E52"/><stop offset="1" stop-color="#041535"/></linearGradient>
        <linearGradient id="heroGlow" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#1677FF" stop-opacity=".42"/><stop offset="1" stop-color="#1677FF" stop-opacity="0"/></linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#153260" flood-opacity=".10"/></filter>
      </defs>
      <rect width="${POSTER_WIDTH}" height="${totalHeight}" fill="#F7F9FC" />
      <rect x="${SHEET_X}" y="24" width="${SHEET_WIDTH}" height="${totalHeight - 48}" rx="18" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.2" filter="url(#shadow)" />
      <rect x="${SHEET_X}" y="24" width="${SHEET_WIDTH}" height="202" rx="18" fill="url(#hero)" />
      <path d="M24 194 C190 70 278 240 442 126 S730 70 936 28 L936 226 L24 226Z" fill="url(#heroGlow)" opacity=".85" />
      <path d="M24 184 C180 70 280 222 446 120 S720 76 936 45" fill="none" stroke="#69A9FF" stroke-opacity=".35" stroke-width="1" />
      <path d="M24 202 C190 88 286 236 460 142 S742 96 936 56" fill="none" stroke="#69A9FF" stroke-opacity=".18" stroke-width="1" />
      <circle cx="864" cy="62" r="2" fill="#8CC2FF"/><circle cx="823" cy="94" r="1.5" fill="#8CC2FF"/><circle cx="442" cy="62" r="2" fill="#8CC2FF"/>
      <g transform="translate(64 66)"><rect width="92" height="92" rx="20" fill="#E7F1FF" fill-opacity=".18" stroke="#A7CEFF" stroke-width="2"/><rect x="18" y="13" width="56" height="68" rx="8" fill="#D7E9FF" stroke="#7BB5FF" stroke-width="2"/><path d="M32 38h28M32 51h20M32 64h12" stroke="#1769CE" stroke-width="5" stroke-linecap="round"/><circle cx="74" cy="76" r="16" fill="#45D39A" stroke="#D7FFF0" stroke-width="2"/><path d="m67 76 5 5 9-11" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
      <text x="190" y="98" fill="#FFFFFF" font-family="${DISPLAY_FONT}" font-size="48" font-weight="700">提交当日记录</text>
      <text x="193" y="137" fill="#BFD8FF" font-family="${BODY_FONT}" font-size="17" letter-spacing="3">DAILY GIT REPORT</text>
      <path d="M190 151h36M248 151h36" stroke="#91BFFF" stroke-width="2" opacity=".8" />
      ${iconMarkup('calendar', 190, 166, '#8BC2FF')}
      <text x="222" y="184" fill="#E6F1FF" font-family="${BODY_FONT}" font-size="17" font-weight="600">${escapeXml(formatDateLabel(group.date))}</text>
      <g transform="translate(690 76)"><rect width="206" height="104" rx="26" fill="#071A45" fill-opacity=".42" stroke="#87B9FF" stroke-opacity=".65"/><path d="M28 74V56M41 74V42M54 74V30" stroke="#38A0FF" stroke-width="8"/><text x="77" y="61" fill="#FFFFFF" font-family="${BODY_FONT}" font-size="34" font-weight="800">${group.totalCommits}</text><text x="77" y="82" fill="#C6DCFF" font-family="${BODY_FONT}" font-size="13">条提交</text><text x="146" y="63" fill="#FFFFFF" font-family="${BODY_FONT}" font-size="28" font-weight="700">· ${repositories.length}</text><text x="146" y="82" fill="#C6DCFF" font-family="${BODY_FONT}" font-size="13">个仓库</text></g>

      <rect x="${CONTENT_X - 14}" y="${summaryCardY}" width="${CONTENT_WIDTH + 28}" height="${summaryCardHeight}" rx="18" fill="#FFFFFF" stroke="#E3EBF5" filter="url(#shadow)" />
      ${sectionHeading('overview', '当日概览', 272)}
      ${summaryLayout.placements.map((chip) => chipMarkup(chip, CONTENT_X, summaryY, 42)).join('')}

      <rect x="${CONTENT_X - 14}" y="${repoCardY}" width="${CONTENT_WIDTH + 28}" height="${repoCardHeight}" rx="18" fill="#FFFFFF" stroke="#E3EBF5" filter="url(#shadow)" />
      ${sectionHeading('repo', '相关仓库', repoLabelY, `${repositories.length} 个`, 'next')}
      ${repoLayout.placements.map((chip) => chipMarkup(chip, CONTENT_X, repoY, 36)).join('')}

      <rect x="${CONTENT_X - 14}" y="${recordsCardY}" width="${CONTENT_WIDTH + 28}" height="${totalHeight - recordsCardY - 44}" rx="18" fill="#FFFFFF" stroke="#E3EBF5" filter="url(#shadow)" />
      ${sectionHeading('records', '提交记录', recordsLabelY)}
      <g>
        ${(['feature', 'optimize', 'release', 'merge'] as CommitCategory[]).map((category, index) => {
          const tone = COMMIT_CATEGORY_TONES[category];
          const x = 600 + index * 82;
          return `<circle cx="${x}" cy="${recordsLabelY - 11}" r="5" fill="${tone.stroke}"/><text x="${x + 11}" y="${recordsLabelY - 6}" fill="#5B6472" font-family="${BODY_FONT}" font-size="11">${escapeXml(tone.label)}</text>`;
        }).join('')}
      </g>
      <path d="M82 ${recordsY + 36}V${cursorY - rowGap - 36}" stroke="#C9D9EF" stroke-width="2" />
      ${rows.map((row) => `<g transform="translate(${RECORD_ROW_X}, 0)">${row}</g>`).join('')}
      ${rowHeights.map((height, index) => {
        const rowTop = recordsY + rowHeights.slice(0, index).reduce((sum, item) => sum + item + rowGap, 0);
        const y = rowTop + height / 2;
        const tone = COMMIT_CATEGORY_TONES[commitCategory(sortedCommits[index])];
        return `<circle cx="82" cy="${y}" r="8" fill="#FFFFFF" stroke="${sortedCommits[index].isOvertime ? '#F5222D' : tone.stroke}" stroke-width="4"/>`;
      }).join('')}
      <rect x="${SHEET_X}" y="${totalHeight - 70}" width="${SHEET_WIDTH}" height="46" rx="15" fill="url(#hero)" />
      <path d="M24 ${totalHeight - 35} C180 ${totalHeight - 85} 280 ${totalHeight - 14} 450 ${totalHeight - 48} S730 ${totalHeight - 64} 936 ${totalHeight - 84}" fill="none" stroke="#72B4FF" stroke-opacity=".45" />
      <text x="480" y="${totalHeight - 40}" text-anchor="middle" fill="#FFFFFF" font-family="${BODY_FONT}" font-size="16" letter-spacing="1">From Coding History</text>
    </svg>
  `;

  return {
    svg,
    width: POSTER_WIDTH,
    height: totalHeight,
    filename: `git-statistics-${group.date}-commit-day.png`,
  };
}

async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('图片资源加载失败，请重试'));
    });
    image.src = objectUrl;
    await loaded;

    const maxCanvasHeight = 14000;
    const scale = Math.min(1.5, Math.max(0.25, maxCanvasHeight / height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器不支持 canvas 导出');

    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('图片导出失败'));
      }, 'image/png');
    });
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function downloadCommitDayPosterBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export async function createCommitDayPosterBlob(group: CommitsByDate, metricsConfig: WorkStatusMetricsConfig | null): Promise<{ blob: Blob; filename: string }> {
  const { svg, width, height, filename } = buildCommitDayPosterSvg(group, metricsConfig);
  const blob = await svgToPngBlob(svg, width, height);
  return { blob, filename };
}

export async function exportCommitDayPoster(group: CommitsByDate, metricsConfig: WorkStatusMetricsConfig | null): Promise<string> {
  const { blob, filename } = await createCommitDayPosterBlob(group, metricsConfig);
  downloadCommitDayPosterBlob(blob, filename);
  return filename;
}
