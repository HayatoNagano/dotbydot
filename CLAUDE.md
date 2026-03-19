# CLAUDE.md

このファイルはClaude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

「dot by dot」はDead by Daylightにインスパイアされた2Dドット絵の非対称型対戦ホラーゲーム。ブラウザ上で動作する。1v1（サバイバー vs キラー）で、ローカル2P分割画面またはCPU対戦の一人プレイに対応。TypeScriptとCanvas 2D APIのみで構築し、ゲームエンジンやフレームワークは不使用。

## コマンド

- `npm run dev` — Vite開発サーバー起動
- `npm run build` — `tsc`で型チェック後、Viteでプロダクションビルド
- `npx tsc --noEmit` — 型チェックのみ
- `npx vitest run` — 全テスト実行
- `npx vitest run src/__tests__/FogOfWar.test.ts` — 単一テストファイル実行
- `npx vitest` — ウォッチモードでテスト実行

## アーキテクチャ

### ゲームループ
`main.ts`が`GameLoop`を生成（固定タイムステップ1/60秒 + 描画補間）。2つのフェーズ: **メニュー**（タイトル → モード選択 → キャラ選択）と**ゲーム**（対戦）。`Game`は毎試合再生成、`Input`は試合を跨いで共有。

### 更新サイクル (`Game.update`)
毎ティック: 入力読み取り（またはAI出力） → 能力 → 移動+タイル衝突 → インタラクション（修理/フック/板/ロッカー） → 投射物更新（斧、罠） → 霧再計算 → カメラ追従 → 勝敗判定。`Game`クラスが全エンティティとシステムを直接保持する中央オーケストレーター（ECSではない）。

### 座標系
- **タイル座標**: 整数グリッド（50×50）、`TileMap`・`FogOfWar`・`Pathfinding`で使用
- **ピクセル座標**: タイル × 16px、エンティティの位置・移動・衝突で使用
- 変換: `tileX = Math.floor(px / TILE_SIZE)`

### レンダリング
`Renderer.renderView()`が1プレイヤー分のビューポートを描画: タイル → ワールドオブジェクト → 傷跡 → キャラクター → 霧エッジ → テラーレイディアスオーバーレイ。ローカル2Pではクリッピングで2回呼び出し（左半分=サバイバー、右半分=キラー）。CPU対戦ではフル幅で1回。

### 霧（Fog of War）
プレイヤーごとの`boolean[]`グリッド。プレイヤーがタイル境界を跨いだ時のみ再計算（毎フレームではない）。半径内のBFSフラッドフィル + ブレゼンハム法による壁への視線チェック。端の壁は見えるが、その向こうは見えない。

### エンティティ階層
`Entity`（id, pos, size） → `Character`（移動、衝突、方向、補間） → `Survivor` / `Killer`。ワールドオブジェクト（`Generator`、`Hook`、`Pallet`、`Locker`、`ExitGate`、`Trap`、`Axe`）は`Entity`を直接継承。

### 能力（Ability）
抽象基底クラス`Ability`（クールダウン/持続時間/発動ライフサイクル）。具象: `SprintBurst`、`DeadHard`（サバイバー）、`TrapAbility`、`ThrowAxe`（キラー）。`TrapAbility`と`ThrowAxe`は生成した`Trap`/`Axe`投射物エンティティの配列を保持。

### AI
FSMベース、霧を尊重（チートなし）。`KillerAI`: 巡回 → 調査（傷跡） → 追跡 → 攻撃 → 搬送 → フック。`SurvivorAI`: 修理 → 逃走 → 脱出。両者とも`Pathfinding`（A*）でナビゲーション。AI出力は`{ dx, dy, interact, ability, walk }`で、プレイヤー入力と同じ形式。

### イベントシステム
`core/EventBus.ts`のシングルトン`EventBus`。現在`generator_completed`（閾値到達時にゲート通電を発火）と`survivor_sacrificed`で使用。

## 設計上の決定事項

- **外部依存ゼロ** — ランタイム依存なし、TypeScript/Vite/Vitestのみdev依存
- **定数は`constants.ts`に集約** — ゲームプレイのチューニング値を一元管理
- **型・Enumは`types.ts`に集約** — 共有型定義
- **仮アート** — 全ビジュアルは色付き矩形。スプライトはPhase 6（未実装）
- **シード付きRNG** — マップ生成・オブジェクト配置に決定的な乱数を使用し再現性を確保
- **Canvas clippingによる画面分割** — ビューポートごとに`ctx.save()` / `ctx.clip()` / `ctx.translate()`、別Canvasは使わない

### 音声 (AudioManager)
`audio/AudioManager.ts`のシングルトン。Web Audio APIで全音声を手続き的に合成（音声ファイル不使用）。最初のユーザー操作（keydown/click）で`AudioContext`を初期化。ハートビート（テラーレイディアス連動、距離でテンポ変化）、ダークアンビエントBGM（低音ドローン+LFO）、各種SE（攻撃、ヒット、板、ロッカー、発電機、スキルチェック、フック、罠、斧、ゲート通電、脱出、生贄）。

## 未実装（Phase 6残り）

スプライトシート、画面エフェクト（ヒット時の振動）、メニューUIの仕上げ。
