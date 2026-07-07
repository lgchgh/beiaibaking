function normalizeText(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeSrc(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '')
    .toLowerCase();
}

function filenameStem(value) {
  const src = String(value == null ? '' : value).replace(/\\/g, '/');
  const tail = src.split('/').pop() || 'image';
  const bare = tail.split('?')[0];
  const dot = bare.lastIndexOf('.');
  return dot > 0 ? bare.slice(0, dot) : bare;
}

function cleanLabel(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const EXACT_ALT_BY_SRC = {
  'assets/images/decorated-cakes/floral/f-01.jpg': 'Pink ombre drip cake topped with buttercream roses and a gold Love topper',
  'assets/images/decorated-cakes/floral/f-02.jpg': 'White floral cake with buttercream roses and a peony on a scalloped square board',
  'assets/images/decorated-cakes/floral/f-03.jpg': 'Dog character cake with HAPPY lettering on a peach textured finish',
  'assets/images/decorated-cakes/floral/f-04.jpg': 'Pink and yellow teddy bear cake holding a heart topper',
  'assets/images/decorated-cakes/animal/a-01.jpg': 'Pink and yellow teddy bear cake holding a heart topper',
  'assets/images/decorated-cakes/animal/a-02.jpg': 'Dog character cake with HAPPY lettering on a peach textured finish',
  'assets/images/decorated-cakes/animal/a-03.jpg': 'White floral cake with buttercream roses and a peony on a scalloped square board',
  'assets/images/decorated-cakes/animal/a-04.jpg': 'Pink ombre drip cake topped with buttercream roses and a gold Love topper',
  'assets/images/decorated-cakes/character/c-01.jpg': 'White floral cake with buttercream roses and a peony on a scalloped square board',
  'assets/images/decorated-cakes/character/c-02.jpg': 'Pink and yellow teddy bear cake holding a heart topper',
  'assets/images/decorated-cakes/character/c-03.jpg': 'Dog character cake with HAPPY lettering on a peach textured finish',
  'assets/images/decorated-cakes/character/c-04.jpg': 'Pink ombre drip cake topped with buttercream roses and a gold Love topper',
};

const GENERIC_ALT_BY_TEXT = {
  'animal cake 1': 'Cute bear themed decorated cake',
  'animal cake 2': 'Dog character decorated cake',
  'animal cake 3': 'Floral decorated cake with buttercream roses',
  'animal cake 4': 'Pink drip cake with buttercream roses',
  'avril lavigne': 'Portrait cake featuring Avril Lavigne',
  'barbie princess': 'Barbie princess themed decorated cake',
  'beach yoga': 'Mirror glaze pastry with beach yoga design',
  'bean paste piping': 'Decorated cake with bean paste piping',
  'beer': 'Beer themed fondant cake',
  'beauty and the beast': 'Beauty and the Beast themed decorated cookie',
  'blossoms': 'Decorated cake with blossom details',
  'blue and white porcelain': 'Blue and white porcelain themed fondant cake',
  'buttercream piping': 'Buttercream cake with piped details',
  carousel: 'Carousel themed fondant cake',
  'character cake 1': 'Floral decorated cake with buttercream roses',
  'character cake 2': 'Cute bear themed decorated cake',
  'character cake 3': 'Dog character decorated cake',
  'character cake 4': 'Pink drip cake with buttercream roses',
  'cartoon character': 'Cartoon character decorated cake',
  'cookie': 'Decorated iced cookie',
  'cookies': 'Decorated iced cookies',
  'cute bear': 'Cute bear themed decorated cake',
  deer: 'Deer themed decorated cake',
  eclairs: 'French eclairs',
  elf: 'Elf themed decorated cake',
  'emperor and queen': 'Yellow cake with emperor and queen character toppers',
  'elegant wedding cake': 'Elegant fondant wedding cake',
  'durian cheesecake': 'Durian cheesecake pastry',
  'durian tart': 'Durian tart pastry',
  halloween: 'Halloween themed mirror glaze pastry',
  'fish': 'Fish themed decorated cake',
  'floral cake 1': 'Pink drip cake with buttercream roses',
  'floral cake 2': 'White floral cake with buttercream roses',
  'floral cake 3': 'Dog character decorated cake',
  'floral cake 4': 'Cute bear themed decorated cake',
  'floral basket': 'Basket arrangement with piped buttercream flowers',
  'floral box': 'Gift box arrangement with piped flowers',
  'floral cupcake': 'Cupcake topped with piped buttercream flowers',
  'flower ball': 'Decorated cake topped with a flower ball design',
  'flower bed': 'Decorated cake with flower bed design',
  'flower wreath': 'Decorated cake with floral wreath design',
  gege: 'Decorated cake with Gege character design',
  'gift box set': 'Cookie gift box',
  giraffe: 'Giraffe themed decorated cake',
  girl: 'Decorated cake with illustrated girl portrait',
  'holiday cookies': 'Holiday decorated cookies',
  heart: 'Heart shaped French pastry',
  'handbag cake': 'Handbag shaped decorated cake',
  'iced cookies': 'Decorated iced cookies',
  image: 'Gallery image',
  'lemon tart': 'Lemon tart pastry',
  'little flower': 'Decorated cake with small flower piping',
  love: 'Love themed decorated iced cookie',
  'lychee tart': 'Lychee tart pastry',
  macaron: 'French macarons',
  macarons: 'French macarons',
  'm&m': 'M&M themed fondant cake',
  mirror: 'Mirror glaze French pastry',
  'moth orchid': 'Decorated cake with moth orchid flower design',
  nike: 'Nike themed fondant cake',
  'pensive girl': 'Decorated cake with pensive girl portrait',
  'pirates of the caribbean': 'Pirates of the Caribbean themed fondant cake',
  'pistachio cheesecake': 'Pistachio cheesecake pastry',
  rabbit: 'Rabbit themed decorated cake',
  scabiosa: 'Decorated cake with scabiosa flower design',
  'mirror glaze cake': 'Mirror glaze French pastry',
  sleeper: 'Sleeping baby fondant cake',
  snoopy: 'Snoopy character cake',
  'fortune cat': 'Fortune cat themed fondant cake',
  'swiss roll': 'Swiss roll pastry',
  'taj mahal': 'Taj Mahal themed fondant cake',
  'the little mermaid': 'The Little Mermaid themed decorated cake',
  tarts: 'French tarts',
  totoro: 'Totoro themed decorated cake',
  'unicorn éclair': 'Unicorn themed éclair pastry',
  'wang leehom and angelababy': 'Portrait cake featuring Wang Leehom and Angelababy',
  wedding: 'Fondant wedding cake',
  'wedding fondant cake': 'Fondant wedding cake',
  'white & gold wedding cake': 'White and gold fondant wedding cake',
  'year of the rooster': 'Rooster themed decorated cake',
  'éclair': 'French éclair pastry',
};

const CATEGORY_SUB_DEFAULTS = {
  cookies: {
    cookies: 'Decorated iced cookie',
  },
  decorated: {
    'decorated-animal': 'Animal themed decorated cake',
    'decorated-character': 'Character themed decorated cake',
    'decorated-floral': 'Floral decorated cake',
  },
  fondant: {
    character: 'Character fondant cake',
    wedding: 'Fondant wedding cake',
  },
  french: {
    assorted: 'French pastry assortment',
    macaron: 'French macarons',
    macarons: 'French macarons',
    mirror: 'Mirror glaze French pastry',
  },
};

const CATEGORY_DEFAULTS = {
  cookies: 'Decorated iced cookie',
  decorated: 'Custom decorated cake',
  fondant: 'Custom fondant cake',
  french: 'French pastry',
};

function buildGalleryAlt(row) {
  const category = normalizeText(row && row.category);
  const subcategory = normalizeText(row && row.subcategory);
  const src = normalizeSrc(row && row.src);
  if (src && EXACT_ALT_BY_SRC[src]) return EXACT_ALT_BY_SRC[src];

  const sourceText =
    cleanLabel(row && row.alt) ||
    cleanLabel(row && row.caption) ||
    cleanLabel(filenameStem(row && row.src));
  const key = normalizeText(sourceText);
  if (key && /^\d+$/.test(key)) {
    const subDefaults = CATEGORY_SUB_DEFAULTS[category] || {};
    if (subcategory && subDefaults[subcategory]) return subDefaults[subcategory];
    return CATEGORY_DEFAULTS[category] || 'Gallery image';
  }
  if (key && GENERIC_ALT_BY_TEXT[key]) return GENERIC_ALT_BY_TEXT[key];
  if (sourceText && key !== 'image') return sourceText;

  const subDefaults = CATEGORY_SUB_DEFAULTS[category] || {};
  if (subcategory && subDefaults[subcategory]) return subDefaults[subcategory];
  return CATEGORY_DEFAULTS[category] || 'Gallery image';
}

function shouldBackfillGalleryAlt(row) {
  const current = cleanLabel(row && row.alt);
  if (!current) return true;
  if (/^\d+$/.test(current)) return true;
  const desired = buildGalleryAlt(row);
  if (normalizeText(current) === normalizeText(desired)) return false;
  if (normalizeText(current) === normalizeText(row && row.caption)) return true;
  return Object.prototype.hasOwnProperty.call(GENERIC_ALT_BY_TEXT, normalizeText(current));
}

module.exports = {
  buildGalleryAlt,
  shouldBackfillGalleryAlt,
};
