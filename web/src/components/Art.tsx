/* Fine-line drawings (moodboard motifs). Shown until real tattoo photos are added,
   and used as ornaments: gunungan, lung-lungan, truntum, gebyok. */

const MOTIFS: Record<string, { viewBox: string; body: string }> = {
  gunungan: {
    viewBox: '0 0 200 300',
    body: `<path d="M100 12 C128 58 172 118 178 188 C182 236 158 268 100 286 C42 268 18 236 22 188 C28 118 72 58 100 12 Z"/><path d="M100 30 C124 70 160 124 165 186 C168 228 148 256 100 270 C52 256 32 228 35 186 C40 124 76 70 100 30 Z"/><path d="M100 246 V70"/><path d="M100 214 C80 206 60 188 66 168 C72 152 90 158 86 170"/><path d="M100 214 C120 206 140 188 134 168 C128 152 110 158 114 170"/><path d="M100 174 C82 164 70 146 78 130 C86 118 98 126 94 136"/><path d="M100 174 C118 164 130 146 122 130 C114 118 102 126 106 136"/><path d="M100 132 C88 122 84 106 92 96 C98 90 104 96 100 102"/><path d="M100 132 C112 122 116 106 108 96 C102 90 96 96 100 102"/><path d="M72 270 V246 H128 V270"/><path d="M66 246 L100 228 L134 246"/><path d="M100 246 V270"/><circle class="dot" cx="60" cy="120" r="1.6"/><circle class="dot" cx="140" cy="120" r="1.6"/><circle class="dot" cx="50" cy="200" r="1.6"/><circle class="dot" cx="150" cy="200" r="1.6"/><circle class="dot" cx="100" cy="52" r="1.6"/>`,
  },
  lung: {
    viewBox: '0 0 120 200',
    body: `<path d="M60 190 C56 150 66 110 58 70 C54 46 62 24 70 10"/><path d="M59 160 C44 156 34 144 34 132 C46 134 56 144 59 160 Z"/><path d="M61 128 C76 124 86 112 86 100 C74 102 64 112 61 128 Z"/><path d="M58 96 C44 90 38 78 40 66 C52 70 58 82 58 96 Z"/><path d="M62 64 C74 58 80 46 78 36 C68 40 62 50 62 64 Z"/><path d="M66 22 C60 14 64 6 72 8 C76 12 72 18 68 16"/><path d="M40 132 C30 124 32 112 42 114"/><path d="M86 100 C96 92 94 80 84 82"/><circle class="dot" cx="40" cy="110" r="1.6"/><circle class="dot" cx="84" cy="80" r="1.6"/><circle class="dot" cx="48" cy="44" r="1.6"/>`,
  },
  truntum: {
    viewBox: '-40 -40 80 80',
    body: `<circle cx="0" cy="0" r="4"/><ellipse cx="0" cy="-14" rx="4" ry="9"/><ellipse cx="0" cy="-14" rx="4" ry="9" transform="rotate(45)"/><ellipse cx="0" cy="-14" rx="4" ry="9" transform="rotate(90)"/><ellipse cx="0" cy="-14" rx="4" ry="9" transform="rotate(135)"/><ellipse cx="0" cy="-14" rx="4" ry="9" transform="rotate(180)"/><ellipse cx="0" cy="-14" rx="4" ry="9" transform="rotate(225)"/><ellipse cx="0" cy="-14" rx="4" ry="9" transform="rotate(270)"/><ellipse cx="0" cy="-14" rx="4" ry="9" transform="rotate(315)"/><circle class="dot" cx="0" cy="-32" r="1.4"/><circle class="dot" cx="32" cy="0" r="1.4"/><circle class="dot" cx="0" cy="32" r="1.4"/><circle class="dot" cx="-32" cy="0" r="1.4"/>`,
  },
  aksara: {
    viewBox: '0 0 200 200',
    body: `<text x="100" y="112" text-anchor="middle" font-family="var(--f-jv)" font-size="44" stroke="none" fill="currentColor">ꦲꦤꦕꦫꦏ</text><path d="M48 132 C80 140 120 140 152 132"/><circle class="dot" cx="100" cy="150" r="1.8"/>`,
  },
  rose: {
    viewBox: '0 0 200 200',
    body: `<path d="M100 70c-9 0-15 6-15 13s6 11 12 11 9-4 9-8-3-6-6-6"/><path d="M85 83c-10 2-17 11-14 22 3 12 16 18 29 18s26-6 29-18c3-11-4-20-14-22"/><path d="M100 60c-14-1-26 8-28 20M100 60c14-1 26 8 28 20"/><path d="M71 105c-6 6-4 16 4 20M129 105c6 6 4 16-4 20"/><path d="M100 123v62"/><path d="M100 150c-12-10-28-8-34 2 12 6 24 4 34-2Z"/><path d="M100 165c11-9 25-8 31 1-11 6-22 5-31-1Z"/>`,
  },
  eye: {
    viewBox: '0 0 200 200',
    body: `<path d="M40 100c18-26 40-38 60-38s42 12 60 38c-18 26-40 38-60 38s-42-12-60-38Z"/><circle cx="100" cy="100" r="22"/><circle cx="100" cy="100" r="9"/><path d="M58 80l-8-10M75 68l-4-12M100 62V49M125 68l4-12M142 80l8-10"/>`,
  },
  leaf: {
    viewBox: '0 0 200 200',
    body: `<path d="M100 185C98 140 96 95 104 20"/><path d="M101 160c-18-4-30-16-32-30 16 2 28 12 32 30Z"/><path d="M100 130c18-4 30-16 32-30-16 2-28 12-32 30Z"/><path d="M100 102c-17-5-27-17-28-31 15 3 26 14 28 31Z"/><path d="M102 74c15-5 24-16 25-29-14 3-24 13-25 29Z"/>`,
  },
  script: {
    viewBox: '0 0 200 200',
    body: `<text x="100" y="108" text-anchor="middle" font-family="var(--f-serif)" font-style="italic" font-size="40" stroke="none" fill="currentColor">always</text><path d="M58 122c28 6 56 6 84 0"/>`,
  },
  snake: {
    viewBox: '0 0 200 200',
    body: `<path d="M70 175c-30-14-20-48 10-52s44-26 26-48-6-46 22-44"/><path d="M78 178c-30-16-18-56 12-58s38-24 22-46-2-40 22-38"/><path d="M128 31c8-4 18-2 22 4-4 6-14 8-22 4"/><circle class="dot" cx="137" cy="33" r="1.4"/>`,
  },
  sun: {
    viewBox: '0 0 200 200',
    body: `<circle cx="100" cy="100" r="26"/><circle cx="100" cy="100" r="34"/><circle cx="100" cy="100" r="6"/><path d="M100 52V30M100 148v22M52 100H30M148 100h22M66 66 50 50M134 134l16 16M66 134l-16 16M134 66l16-16"/>`,
  },
  moon: {
    viewBox: '0 0 200 200',
    body: `<path d="M118 52a50 50 0 1 0 0 96 42 42 0 1 1 0-96Z"/><path d="M150 74l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/><path d="M40 182h120"/>`,
  },
  compass: {
    viewBox: '0 0 200 200',
    body: `<circle cx="100" cy="100" r="40"/><path d="M100 20l8 72 72 8-72 8-8 72-8-72-72-8 72-8Z"/><path d="M100 60l4 36 36 4-36 4-4 36-4-36-36-4 36-4Z"/><circle cx="100" cy="100" r="3"/>`,
  },
  wave: {
    viewBox: '0 0 200 200',
    body: `<path d="M30 140c20 0 30-10 40-30s30-50 60-44 34 40 12 52-34-6-26-20 26-6 28 6"/><path d="M30 152c30 0 46-6 60-12s34-4 50 4 20 8 30 8"/><circle cx="150" cy="44" r="10"/>`,
  },
  butterfly: {
    viewBox: '0 0 200 200',
    body: `<path d="M100 70v70"/><path d="M100 82c-10-30-44-40-56-24-12 18 14 40 56 32Z"/><path d="M100 82c10-30 44-40 56-24 12 18-14 40-56 32Z"/><path d="M100 96c-18 2-40 14-34 32 6 14 26 6 34-14Z"/><path d="M100 96c18 2 40 14 34 32-6 14-26 6-34-14Z"/>`,
  },
};

export function Art({ motif, className = '' }: { motif: string; className?: string }) {
  const m = MOTIFS[motif] ?? MOTIFS.lung;
  return (
    <svg
      className={`art-svg ${className}`}
      viewBox={m.viewBox}
      aria-hidden="true"
      // Static, trusted markup from the constant above.
      dangerouslySetInnerHTML={{ __html: m.body }}
    />
  );
}

/** Horizontal lung-lungan vine used as a section divider. */
export function VineDivider({ className = '' }: { className?: string }) {
  return (
    <svg className={`art-svg vine ${className}`} viewBox="0 0 380 40" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d="M0 20 H140" />
      <path d="M140 20 C160 6 176 34 190 20 C204 6 220 34 240 20" />
      <path d="M240 20 H380" />
      <path d="M166 14 C162 6 170 2 176 6 C180 10 176 14 172 12" />
      <path d="M214 26 C218 34 210 38 204 34 C200 30 204 26 208 28" />
      <circle className="dot" cx="190" cy="20" r="2" />
    </svg>
  );
}

export const TONES = ['mori', 'sogan', 'wedel', 'sand'] as const;

/** A photo when one is set, otherwise a toned tile with a line drawing. */
export function ArtTile({
  motif,
  tone,
  image,
  alt = '',
  className = '',
}: {
  motif: string;
  tone: (typeof TONES)[number];
  image?: string | null;
  alt?: string;
  className?: string;
}) {
  return (
    <div className={`art-tile ${className}`} data-tone={tone}>
      {image ? <img src={image} alt={alt} loading="lazy" decoding="async" /> : <Art motif={motif} />}
    </div>
  );
}
