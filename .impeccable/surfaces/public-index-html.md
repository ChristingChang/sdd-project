---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: ["public/app.js","public/style.css"]
---

# 浪乘 web app（全部頁面）

## Scope
Mode: Operate. 首頁（找車）、行程頁、發車頁、我的、登入提示，以及全站導覽。手機優先，桌面寬度置中成單欄。

## Task
- 乘客（多半從分享連結進來）：挑日期、看得出這趟車適不適合（浪點、時間、上車點、座位、載板），申請。
- 司機：快速發車、處理申請。
- Constraints: PR-FIND-05（預設明天、一鍵全部日期、明天沒車要提示並給切換）；PR-CONTACT-02；零第三方套件；CSP 不允許 inline style。

## Direction contract
THESIS: 用使用者熟悉的揪團 App 結構取代 FB 式卡片堆疊：日期是第一層導航，行程是可掃讀的列，座位是一眼可讀的膠囊。拒絕把篩選做成表單、把行程做成資訊卡牆。
OWN-WORLD: 沿用浪乘既有的海藍（主色、選取態）、沙色地、白色分組容器、語意色標籤；平面、無陰影；圓角 10–14px；線條圖示自繪 SVG，同一筆畫粗細。
STORY: 打開就看到明天有幾台車；左右滑日期看其他天，數字告訴你哪天有車；點一列看完整行程並申請。司機從底部「發車」一鍵開始。
FIRST VIEWPORT: 頂端大字品牌「浪乘」；標題「台北到宜蘭的共乘行程」；橫向日期列（全部、今天起 7 天、日曆），每顆標行程數，預設選明天；「全部」放第一顆，因為手機上日期列要捲動、放最後會被藏起來（PR-FIND-05 要一鍵可及）；寬螢幕上九顆平分整列，不捲動；日期列下方一行「明天 11/13（五）・N 趟」，浪點篩選在這一行右側，緊貼它篩的列表；下方行程列：左側浪點方塊、中間時間與上車點、右側座位膠囊與箭頭；底部固定分頁列：找車、發車、我的。
FORM: 使用者參考圖的結構（揪團 App：日期列＋列表＋底部分頁列），list position n/a, seed: none (pinned) — 使用者原話：「參考那張圖的結構改版」，並選定「所有頁面一次改完」「從今天開始，共 7 天」「浪點名稱」放列表左欄。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- 參考 App 的品牌外觀（橘色、字體、Logo）不採用，只借結構。
