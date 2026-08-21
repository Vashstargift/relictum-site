/* RELICTUM — порядок карточек на витрине.
 *
 * Одна функция на два места: её зовёт render() в catalog.html и предрендер
 * сборщика. Держать две копии нельзя — разойдутся, и сетка будет
 * перестраиваться после загрузки.
 *
 * Три правила разом:
 *   1. вещи одного типа не стоят рядом;
 *   2. окаменелости и динозавры идут выше минералов и метеоритов;
 *   3. сначала то, что в наличии, «под заказ» вплетается каждым пятым.
 */
(function (root) {
  /* Бытовые группы поверх служебной категории — те же, что в фильтре «Тип». */
  var KINDS = [
    ["Динозавры",                 ["Динозавры"]],
    ["Морские ящеры и рыбы",      ["Морские рептилии", "Ископаемые рыбы", "Мегалодон", "Крокодилиформы"]],
    ["Аммониты",                  ["Аммониты"]],
    ["Звери ледникового периода", ["Мамонтовая фауна", "Пещерные львы", "Саблезубые кошки", "Гиены"]],
    ["Морские лилии",             ["Морские лилии"]],
    ["Древнейшая жизнь",          ["Трилобиты", "Ракоскорпионы", "Эдиакарская фауна"]],
    ["Окаменелое дерево",         ["Ископаемая древесина"]],
    ["Минералы и кристаллы",      ["Минералы", "Жеоды"]],
    ["Метеориты",                 ["Метеориты"]],
    ["Бабочки и змеи",            ["Бабочки", "Змеи"]]
  ];
  var KIND_OF = {}, WEIGHT = {};
  KINDS.forEach(function (pair, i) {
    pair[1].forEach(function (c) { KIND_OF[c] = pair[0]; });
    /* Вес падает по списку: палеонтология тянется вверх, минералы и
       метеориты садятся ниже, но не исчезают с первого экрана. */
    WEIGHT[pair[0]] = KINDS.length - i;
  });

  function kindOf(o) { return KIND_OF[o.category] || o.category || "—"; }

  /* Раскладка одной очереди: на каждом шаге берём тип с наибольшим
     «весом × остаток», но никогда тот же, что был предыдущим. */
  function spread(list) {
    var buckets = {}, order = [];
    list.forEach(function (o) {
      var k = kindOf(o);
      if (!buckets[k]) { buckets[k] = []; order.push(k); }
      buckets[k].push(o);
    });
    var out = [], prev = null, left = list.length;
    while (left) {
      var best = null, bestScore = -1;
      order.forEach(function (k) {
        var n = buckets[k].length;
        if (!n || k === prev) return;
        /* Вес в квадрате: иначе крупные группы (метеоритов 22) забивают
           верх витрины одним размером, и палеонтология туда не попадает. */
        var w = WEIGHT[k] || 1;
        var score = w * w * n;
        if (score > bestScore) { bestScore = score; best = k; }
      });
      if (best === null) {                    // остался только предыдущий тип
        order.forEach(function (k) { if (buckets[k].length) best = k; });
      }
      out.push(buckets[best].shift());
      prev = best; left--;
    }
    return out;
  }

  function arrange(list) {
    var stock = spread(list.filter(function (o) { return o.avail === "В наличии"; }));
    var pre   = spread(list.filter(function (o) { return o.avail !== "В наличии"; }));
    if (!stock.length || !pre.length) return stock.concat(pre);
    var out = [], pi = 0;
    stock.forEach(function (o, i) {
      out.push(o);
      if ((i + 1) % 4 === 0 && pi < pre.length) {
        /* Вплетаемая карточка не должна повторить тип соседей. */
        var pick = pi;
        for (var j = pi; j < pre.length; j++) {
          var prevK = kindOf(out[out.length - 1]);
          var nextK = stock[i + 1] ? kindOf(stock[i + 1]) : null;
          if (kindOf(pre[j]) !== prevK && kindOf(pre[j]) !== nextK) { pick = j; break; }
        }
        out.push(pre.splice(pick, 1)[0]);
      }
    });
    while (pi < pre.length) out.push(pre[pi++]);
    return out;
  }

  root.RELICTUM_ORDER = { arrange: arrange, kindOf: kindOf, KINDS: KINDS, KIND_OF: KIND_OF };
})(typeof window !== "undefined" ? window : globalThis);
