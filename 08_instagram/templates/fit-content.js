// Общий для шаблонов приём: если смысловой блок (.content) не помещается в
// место, оставленное колонтитулом, аккуратно уменьшаем его масштаб вокруг
// центра — так он не наезжает на колонтитул и не обрезается краем кадра.
// На обычном (коротком) контенте .content умещается сама, scrollHeight не
// превышает clientHeight, и функция ничего не меняет (масштаб остаётся 1).
function fitContent() {
  var box = document.querySelector('.content');
  if (!box) return;
  var over = box.scrollHeight - box.clientHeight;
  if (over <= 0) return;
  var scale = box.clientHeight / box.scrollHeight;
  box.style.transform = 'scale(' + scale.toFixed(4) + ')';
}
