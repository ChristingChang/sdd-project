---
name: 浪乘
description: 台北到宜蘭的衝浪共乘，手機優先的出發表
colors:
  ocean: "#0b6e8a"
  ocean-dark: "#084f63"
  sand: "#f7f3ea"
  surface: "#ffffff"
  ink: "#1d2b30"
  muted: "#5d6f76"
  line: "#dfe5e6"
  field-line: "#b9c4c7"
  tint: "#e3f1f4"
  selection: "#cfe6ec"
  ok: "#1b7a43"
  ok-tint: "#e0f2e7"
  warn: "#8a5a00"
  warn-tint: "#fbefd5"
  danger: "#b3261e"
  danger-tint: "#f8e4e2"
  line-green: "#06c755"
typography:
  brand:
    fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "26px"
    fontWeight: 800
    letterSpacing: "0.02em"
  headline:
    fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.35
  date-numeral:
    fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  title:
    fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "17px"
    fontWeight: 700
    fontFeature: "tnum"
  body:
    fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "14px"
    fontWeight: 600
  badge:
    fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "13px"
    fontWeight: 600
  caption:
    fontFamily: "system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "12px"
    fontWeight: 600
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  xxl: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  card: "14px"
  gutter: "16px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ocean}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.ocean-dark}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
    height: "44px"
  date-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.date-numeral}"
    rounded: "{rounded.xl}"
    width: "60px"
    height: "68px"
  date-chip-selected:
    backgroundColor: "{colors.ocean}"
    textColor: "{colors.surface}"
  date-count:
    backgroundColor: "{colors.ocean}"
    textColor: "{colors.surface}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: "20px"
  spot-tile:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ocean-dark}"
    rounded: "{rounded.xl}"
    size: "56px"
  seat-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ocean-dark}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  status-badge:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.ocean-dark}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 10px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card}"
  tab:
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    height: "64px"
  tab-current:
    textColor: "{colors.ocean-dark}"
---

# Design System: 浪乘

## Overview

**Creative North Star: "清晨的出發表"**

浪乘的畫面像車站的出發時刻表，只是時刻表上寫的是去宜蘭衝浪的車。使用者打開它只想知道三件事：幾點、去哪、還有沒有位子。第一層導航就是日期，每天標出有幾趟；下面一列一趟車，左邊是浪點、中間是時間和上車點、右邊是剩幾位。版面不需要說明，看一眼就懂。

整體清爽、可靠、不說廢話。沙色地、白色容器、一個海藍主色，全部平面、沒有陰影。人味不靠裝飾，而是靠口語的文案（見 PRODUCT.md 的語氣）。密度偏高但不擠：每一列都是可以點的完整資訊，留白用在列與列、區塊與區塊之間。

這套結構借自使用者熟悉的揪團 App（日期列、列表、底部分頁列），但不借它的品牌外觀。

**Key Characteristics:**
- 日期是第一層導航：橫向日期列，「全部」放第一顆，預設選明天
- 一列一趟車：浪點方塊｜時間與上車點｜座位膠囊與箭頭
- 單一海藍主色，語意色只出現在狀態標籤
- 平面無陰影，深度靠沙色地上的白色容器加 1px 細線
- 主要導覽在底部，拇指搆得到；所有可點的東西至少 44px 高

## Colors

一個海藍主色加上海邊的中性色，狀態色只用在小標籤上。

### Primary
- **外海藍 Offshore Blue** (`ocean`)：唯一的動作色。主要按鈕、選中的日期鈕、每天的行程數、發車的實心圓、座位膠囊的外框。畫面上一眼看到的藍色，就是可以按或已選的東西。
- **深水藍 Deep Water** (`ocean-dark`)：主色的按下與滑過狀態、目前分頁、品牌字「浪乘」、連結、焦點框。對沙色與白色都有約 8:1 的對比。

### Neutral
- **晨沙 Morning Sand** (`sand`)：頁面底色。是這個品牌原有的顏色，刻意保留。
- **白板 Board White** (`surface`)：所有容器（日期鈕、卡片、分組、輸入框、分頁列）。
- **墨 Ink** (`ink`)：主要文字。
- **霧 Haze** (`muted`)：次要文字、日期鈕上的星期、未選分頁、空狀態。對白色約 5.3:1。
- **細線 Hairline** (`line`)：列與列之間的分隔、容器外框。
- **欄線 Field Line** (`field-line`)：輸入框外框、滑過時的容器外框、列尾箭頭。
- **淺潮 Shallow Tint** (`tint`)：浪點方塊底色、一般標籤底色、勾選的浪點、提示框。
- **選取 Selection** (`selection`)：文字反白。

### Status
- **成行綠** (`ok` / `ok-tint`)：已接受、聯絡方式。
- **待確認黃** (`warn` / `warn-tint`)：待確認、N 筆申請待確認。
- **警示紅** (`danger` / `danger-tint`)：已滿、已拒絕、已取消、錯誤訊息、危險按鈕（取消行程、退出）。

### Brand-owned
- **LINE 綠** (`line-green`)：只用在「使用 LINE 登入」按鈕，依 LINE 的品牌規範。

### Named Rules
**The One Accent Rule.** 海藍是唯一的動作色。綠、黃、紅只出現在狀態標籤和錯誤提示，從不拿來做按鈕或裝飾。

**The Line Green Rule.** LINE 綠只屬於 LINE 登入按鈕，其他地方一律不用。

## Typography

**Body Font:** 系統字體（system-ui，中文依序 PingFang TC、Noto Sans TC、Microsoft JhengHei）

**Character:** 一套字體、靠字重和大小分層。數字（時間、日期、行程數、座位）一律用等寬數字，排成一列時會對齊，像時刻表。

### Hierarchy
- **Brand** (800, 26px)：頂端的「浪乘」，深水藍。
- **Headline** (700, 22px, 1.35)：每頁的 h1，例如「台北到宜蘭的共乘行程」、行程頁的日期時間。
- **Date numeral** (700, 22px, 等寬數字)：日期鈕上的日。
- **Title** (700, 17px)：區塊標題 h2、列表摘要「明天 11/13（五）・N 趟」、每列的時間。
- **Body** (400, 16px, 1.5)：一般內文與輸入框。
- **Meta** (400, 14px)：列的次要資訊（浪點、車資、載板、上車點）、詳細資料的欄名。
- **Label** (600, 14px)：表單欄位標籤、按鈕。
- **Badge** (600, 13px)：狀態標籤與座位膠囊。
- **Caption** (600, 12px)：日期鈕上的「今天／明天／週六」、分頁列文字、行程數。

### Named Rules
**The Tabular Time Rule.** 所有時間、日期、數量都用等寬數字（`font-variant-numeric: tabular-nums`）。出發表的數字要對齊。

## Layout

單欄，最寬 560px 置中，左右留 16px。頂端品牌字、內容、底部分頁列都對齊同一欄；寬螢幕時用 `max(16px, (100% - 560px) / 2 + 16px)` 讓頂端與底部的內距跟著內容欄走。

- **日期列**：手機上橫向捲動，左右延伸到內容欄外、隱藏捲軸，右邊露出半顆鈕暗示可以滑。寬度 600px 以上改成九顆平分整列、不捲動（滑鼠滾輪沒辦法橫向捲動）。
- **列表**：每列是三欄格線 `56px | 1fr | auto`，上下 14px，以 1px 細線分隔，最後一列不畫線。
- **表單**：欄位依主題分成白色分組（什麼時候／去哪裡／座位與車資／補充），兩個短欄位並排成 `.pair`。
- **底部分頁列**：固定在底部，高 64px，加上 iPhone 的安全區域；內容底部留出同樣高度，不被蓋住。
- **間距節奏**：4、8、12、16 為基本步；區塊標題上方 24–28px、下方 10px，標題上方的空間永遠比下方大。

### Named Rules
**The 全部-First Rule.** 日期列的第一顆永遠是「全部」。手機上日期列會捲動，放在最後會被藏到畫面外，而規格 PR-FIND-05 要求一鍵切換到全部日期。

**The Thumb Rule.** 主要導覽在畫面底部；所有可點的東西至少 44px 高。

## Elevation & Depth

完全平面，沒有任何陰影。深度只靠兩層：沙色地上放白色容器，容器用 1px 細線收邊。分頁列是半透明白底（96%）加上方一條細線。

### Named Rules
**The Flat Sand Rule.** 不用陰影。要讓東西浮起來，就把它放進白色容器；要讓它更重要，就用海藍填滿，不是加陰影。

## Shapes

柔和但不圓滾：小東西圓角小，大容器圓角大。

- 8px：聯絡方式框
- 10px：輸入框、提示框
- 12px：按鈕
- 14px：日期鈕、卡片、分組容器、浪點方塊
- 18px：行程頁的大浪點方塊
- 全圓角膠囊：狀態標籤、座位膠囊、行程數、浪點勾選鈕、浪點篩選
- 正圓：發車鈕

圖示自繪：24×24 格、2px 筆畫、圓角端點、`currentColor`，不填色。

## Components

### Date Chip（日期鈕）
這套系統的招牌元件，出發表的第一層。
- **Shape:** 60×68px，14px 圓角，白底加細線外框。
- **Content:** 上排星期（caption，霧色）、下排日期（date numeral）。「全部」只有一行字，日曆鈕只有日曆圖示。
- **Selected:** 海藍填滿、白字（`aria-pressed="true"`）；滑過時變深水藍。
- **Count:** 右下角的行程數膠囊，海藍底白字、2px 沙色描邊讓它從鈕上切出來；選中時反過來變白底深水藍字。這天沒車就不顯示。
- **Calendar:** 最後一顆，裡面疊一個透明的原生日期框；選了 7 天以外的日期時，這顆會顯示那天並呈現選中狀態。

### Trip Row（行程列）
- **Left:** 浪點方塊，56px、淺潮底、深水藍粗體字；多個浪點時顯示第一個加「+N」。沒有照片，也不放假照片。
- **Middle:** 時間（title；首頁選了某天時寫「18:07 出發」，其他地方連日期一起寫）、浪點・車資・載板（meta）、定位圖示加上車點（meta）。「我的」頁再加一行身分與狀態標籤。
- **Right:** 座位膠囊加淡色箭頭。
- **Hover / Press:** 滑過時時間變深水藍；按下時整列透明度 75%。

### Seat Pill（座位膠囊）
- 「剩 N 位」：白底、1.5px 海藍外框、深水藍字，是每列右側最醒目的資訊。
- 「已滿」「已取消」：警示紅標籤；「已出發」：淺潮標籤。

### Buttons
- **Shape:** 12px 圓角，至少 44px 高，圖示與文字間距 6px。
- **Primary:** 海藍底白字；滑過變深水藍。
- **Secondary:** 白底、細線外框、墨色字；滑過變淺灰藍 `#f1f5f5`。
- **Danger:** 白底、紅框紅字；滑過變淡紅 `#fdf1f0`。用於取消行程、退出行程。
- **Back:** 無底色的文字鈕，左箭頭加「返回」；從分享連結進來時寫「看更多行程」。
- **Disabled:** 透明度 55%。

### Chips（浪點勾選）
- 全圓角膠囊，白底細線；勾選後整顆變淺潮底、海藍框、深水藍粗體字，不只靠小小的勾勾。

### Cards / Containers
- **Corner Style:** 14px。
- **Background:** 白，放在沙色地上。
- **Border:** 1px 細線。
- **Internal Padding:** 14px。
- 用於行程詳細資料、申請卡、表單分組；列表本身不用卡片。

### Inputs / Fields
- **Style:** 白底、欄線外框、10px 圓角、44px 高；提示文字用霧色。
- **Focus:** 3px 深水藍焦點框，外推 2px。
- **Error:** 外框變警示紅，並加上 `aria-invalid`。

### Navigation（底部分頁列）
- 三格等寬：找車（放大鏡）、發車（海藍實心圓加白色加號）、我的／登入（人像）。
- 一般圖示 24px，上下各補 6px，讓三個文字標籤和發車的 36px 圓對齊同一條線。
- 未選霧色、目前分頁深水藍（`aria-current="page"`）。

## Do's and Don'ts

### Do:
- **Do** 讓每一列一眼回答三件事：幾點、去哪、剩幾位。
- **Do** 把「全部」放在日期列第一顆，預設選明天。
- **Do** 只用海藍當動作色；狀態用綠、黃、紅標籤表示。
- **Do** 用自繪的 2px 線條 SVG 圖示，跟著 `currentColor`。
- **Do** 時間、日期、數量都用等寬數字。
- **Do** 焦點框用 3px 深水藍，外推 2px。

### Don't:
- **Don't** 加陰影；要分層就用白色容器加細線。
- **Don't** 為行程放照片或假縮圖；浪點方塊就是這一欄的主角。
- **Don't** 借用參考 App 的橘色、字體或 Logo；只借結構。
- **Don't** 用 Unicode 符號或表情符號代替圖示（例如「＋」「▶」）。
- **Don't** 把 LINE 綠用在 LINE 登入以外的地方。
- **Don't** 把行程列做成一張張卡片牆；列表用細線分隔就好。
