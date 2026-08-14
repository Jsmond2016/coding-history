import type { Commit, CommitsByDate, WorkStatusMetricsConfig } from '../../../../types/gitStatistics';

const POSTER_WIDTH = 960;
const SHEET_X = 48;
const SHEET_WIDTH = POSTER_WIDTH - SHEET_X * 2;
const CONTENT_X = 80;
const CONTENT_WIDTH = POSTER_WIDTH - CONTENT_X * 2;
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

function buildCommitRowMarkup(commit: Commit, tone: Tone, width: number): { markup: string; height: number } {
  const rowWidth = width - CONTENT_X * 2;
  const leftPadding = 18;
  const rightPadding = 18;
  const timeWidth = 104;
  const hashWidth = 116;
  const messageX = leftPadding + timeWidth + 22;
  const messageWidth = rowWidth - messageX - hashWidth - rightPadding - 18;
  const messageLines = wrapText(commit.message, Math.max(28, Math.floor(messageWidth / 15)));
  const messageLineHeight = 22;
  const rowHeight = Math.max(78, 48 + messageLines.length * messageLineHeight);
  const hash = commit.commitHash.slice(0, 10);
  const accent = commit.isOvertime ? '#F5222D' : tone.stroke;
  const timeFill = commit.isOvertime ? '#FFF0F0' : '#F8FAFC';
  const timeStroke = commit.isOvertime ? '#F2B3B6' : '#D8DEE8';
  const timeText = commit.isOvertime ? '#A8071A' : '#253047';

  const markup = `
    <g>
      <rect width="${rowWidth}" height="${rowHeight}" rx="8" fill="#FFFFFF" stroke="#E3DED4" stroke-width="1.2" />
      <rect width="5" height="${rowHeight}" rx="2.5" fill="${accent}" />
      <rect x="${leftPadding}" y="18" width="${timeWidth}" height="32" rx="16" fill="${timeFill}" stroke="${timeStroke}" stroke-width="1" />
      <text x="${leftPadding + timeWidth / 2}" y="39" text-anchor="middle" fill="${timeText}" font-family="${BODY_FONT}" font-size="15" font-weight="800">${escapeXml(formatCommitTime(commit.commitDate))}</text>
      <text x="${rowWidth - rightPadding}" y="39" text-anchor="end" fill="#7C756B" font-family="monospace" font-size="13" font-weight="700">${escapeXml(hash)}</text>
      ${renderTextLines(messageLines, {
        x: messageX,
        y: 39,
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

function buildSectionLabel(text: string, x: number, y: number, rightText?: string): string {
  return `
    <text x="${x}" y="${y}" fill="#5B5243" font-family="${BODY_FONT}" font-size="15" font-weight="700">${escapeXml(text)}</text>
    ${rightText ? `<text x="${POSTER_WIDTH - CONTENT_X}" y="${y}" text-anchor="end" fill="#8A8173" font-family="${BODY_FONT}" font-size="14">${escapeXml(rightText)}</text>` : ''}
  `;
}

export function buildCommitDayPosterSvg(group: CommitsByDate, metricsConfig: WorkStatusMetricsConfig | null): { svg: string; width: number; height: number; filename: string } {
  const repositories = group.repositories.length > 0 ? group.repositories : [...new Set(group.commits.map((commit) => commit.repoName))];
  const sortedCommits = sortCommitsForPoster(group.commits);
  const summaryLayout = layoutChips(buildSummaryChips(group, metricsConfig), CONTENT_WIDTH, 42, 12, 12);
  const repoLayout = layoutChips(repositories.map((name, index) => {
    const tone = repoTone(index);
    return { text: name, fill: tone.fill, stroke: tone.stroke, textColor: tone.text };
  }), CONTENT_WIDTH, 36, 10, 10);
  const summaryY = 254;
  const repoLabelY = summaryY + summaryLayout.height + 48;
  const repoY = repoLabelY + 18;
  const recordsLabelY = repoY + repoLayout.height + 52;
  const recordsY = recordsLabelY + 22;
  const rowGap = 14;
  const rows: string[] = [];
  let cursorY = recordsY;

  for (const commit of sortedCommits) {
    const repoIndex = repositories.indexOf(commit.repoName);
    const rendered = buildCommitRowMarkup(commit, repoTone(repoIndex >= 0 ? repoIndex : 0), POSTER_WIDTH);
    rows.push(`<g transform="translate(0, ${cursorY})">${rendered.markup}</g>`);
    cursorY += rendered.height + rowGap;
  }

  const totalHeight = Math.max(cursorY + 28, recordsY + 96);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${totalHeight}" viewBox="0 0 ${POSTER_WIDTH} ${totalHeight}">
      <rect width="${POSTER_WIDTH}" height="${totalHeight}" fill="#F2EEE7" />
      <rect x="${SHEET_X}" y="32" width="${SHEET_WIDTH}" height="${totalHeight - 64}" rx="12" fill="#FCFBF8" stroke="#DED8CE" stroke-width="1.5" />
      <rect x="${SHEET_X}" y="32" width="${SHEET_WIDTH}" height="184" rx="12" fill="#1E2D3D" />
      <rect x="${SHEET_X}" y="192" width="${SHEET_WIDTH}" height="24" fill="#1E2D3D" />

      <text x="${CONTENT_X}" y="94" fill="#F8F6F1" font-family="${DISPLAY_FONT}" font-size="40" font-weight="700">提交当日记录</text>
      <text x="${CONTENT_X}" y="132" fill="#C9D7E3" font-family="${BODY_FONT}" font-size="20" font-weight="500">${escapeXml(formatDateLabel(group.date))}</text>
      <text x="${POSTER_WIDTH - CONTENT_X}" y="94" text-anchor="end" fill="#F8F6F1" font-family="${BODY_FONT}" font-size="16" font-weight="700">GIT STATISTICS</text>
      <text x="${POSTER_WIDTH - CONTENT_X}" y="126" text-anchor="end" fill="#C9D7E3" font-family="${BODY_FONT}" font-size="15">${escapeXml(`${group.totalCommits} 条提交  ·  ${repositories.length} 个仓库`)}</text>

      ${buildSectionLabel('当日概览', CONTENT_X, 242)}
      ${summaryLayout.placements.map((chip) => chipMarkup(chip, CONTENT_X, summaryY, 42)).join('')}

      ${buildSectionLabel('相关仓库', CONTENT_X, repoLabelY, `${repositories.length} 个`)}
      ${repoLayout.placements.map((chip) => chipMarkup(chip, CONTENT_X, repoY, 36)).join('')}

      ${buildSectionLabel('提交记录', CONTENT_X, recordsLabelY, '上海时间 · 从早到晚')}
      ${rows.map((row) => `<g transform="translate(${CONTENT_X}, 0)">${row}</g>`).join('')}
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
