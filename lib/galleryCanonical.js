/**
 * 马卡龙仅属于法式西点：写入时若大类误选翻糖/裱花等但子类为 macaron(s)，归一到 french + macarons。
 */
function canonicalCategorySubcategory(category, subcategory) {
  const catIn = String(category || '').trim();
  const subIn = String(subcategory || '').trim();
  if (!catIn || !subIn) return { category: catIn, subcategory: subIn };
  const s = subIn.toLowerCase();
  const isMac = s === 'macaron' || s === 'macaroons' || s === 'macarons';
  if (isMac) return { category: 'french', subcategory: 'macarons' };
  return { category: catIn, subcategory: subIn };
}

module.exports = { canonicalCategorySubcategory };
