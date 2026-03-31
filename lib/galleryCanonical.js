/**
 * 马卡龙仅属于法式西点：大类误选翻糖等 +（子类或标题像马卡龙）时归一到 french + macarons。
 */
function looksLikeMacaronLabel(caption, alt) {
  const labels = ['macaron', 'macarons', '马卡龙'];
  const c = String(caption || '').trim().toLowerCase();
  const a = String(alt || '').trim().toLowerCase();
  return labels.indexOf(c) >= 0 || labels.indexOf(a) >= 0;
}

function subcategoryIsMacaronVariant(sub) {
  const s = String(sub || '').trim().toLowerCase();
  return s === 'macaron' || s === 'macaroons' || s === 'macarons';
}

function canonicalCategorySubcategory(category, subcategory, caption, alt) {
  const catIn = String(category || '').trim();
  const subIn = String(subcategory || '').trim();
  if (!catIn || !subIn) return { category: catIn, subcategory: subIn };
  const catLow = catIn.toLowerCase();
  if (subcategoryIsMacaronVariant(subIn)) {
    return { category: 'french', subcategory: 'macarons' };
  }
  if (catLow === 'fondant' && looksLikeMacaronLabel(caption, alt)) {
    return { category: 'french', subcategory: 'macarons' };
  }
  return { category: catIn, subcategory: subIn };
}

module.exports = { canonicalCategorySubcategory, looksLikeMacaronLabel, subcategoryIsMacaronVariant };
