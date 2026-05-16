# OPM 估值工具 — 系统架构

## 概述

OPM (Option Pricing Method) 估值工具是一个纯前端单页应用，基于 Black-Scholes 期权定价模型，实现企业权益价值在多层资本结构间的分配计算。系统采用 **React + Vite + Tailwind CSS** 技术栈，所有计算均在浏览器端完成，确保数据安全。

## 数据流

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  用户输入    │ ──> │  数据预处理   │ ──> │  OPM 核心计算    │ ──> │  结果展示    │
│             │     │              │     │                  │     │              │
│ • 企业总价值 │     │ • 按优先级排序 │     │ • 构建断点矩阵    │     │ • 断点分配表  │
│ • 波动率 σ   │     │ • 计算清算优先权│     │ • BS 期权定价    │     │ • 估值结果表  │
│ • 无风险利率 r│     │ • 收集 ESOP 行权价│  │ • 增量价值分配   │     │ • 计算详情    │
│ • 期限 T     │     │              │     │ • 动态股权稀释   │     │ • Excel 导出  │
│ • 资本结构   │     │              │     │                  │     │              │
└──────┬───────┘     └──────────────┘     └──────────────────┘     └──────────────┘
       │                                                                    
       │  ┌─────────────────────────────────────────────────────────────┐
       └──│  Excel 导入/导出                                           │
          │  • 下载模板（含示例数据 + 字段说明）                         │
          │  • 导入 Excel（解析资本结构 + 全局参数）                     │
          │  • 导出结果（含计算逻辑说明字符串）                          │
          └─────────────────────────────────────────────────────────────┘
```

## 模块划分

### 1. 输入层 (Input Layer)

| 模块 | 文件 | 功能 |
|------|------|------|
| 参数面板 | `ParametersPanel.jsx` | 全局参数输入：Total Equity Value, σ, r, T |
| 资本结构输入 | `EquityClassInput.jsx` | 支持 6 种证券类型：Common, Preferred, ESOP, SAFE, Convertible, Warrant |
| Excel 导入 | `excelUtils.js` | 解析 .xlsx 文件，提取资本结构和参数 |

### 2. 计算层 (Computation Layer)

| 模块 | 文件 | 功能 |
|------|------|------|
| B-S 核心函数 | `valuationUtils.js` | `normalCDF`, `calculateD1`, `calculateD2`, `calculateCallOption` |
| 断点矩阵 | `valuationUtils.js` | `buildBreakpointMatrix` — 统一排序清算优先权 + ESOP 行权价 |
| 动态股权稀释 | `valuationUtils.js` | `getEffectiveSharesAtBreakpoint` — 按行权价动态计入股数 |
| 主估值函数 | `valuationUtils.js` | `performOPMValuation` — 完整 OPM 计算流程 |

### 3. 展示层 (Presentation Layer)

| 模块 | 文件 | 功能 |
|------|------|------|
| 结果展示 | `ResultsDisplay.jsx` | 断点分配表 + 估值结果表 + 计算详情弹窗 |
| 对比模式 | `App.jsx` | 锁定结果 + 输入审计值进行差异分析 |

### 4. 工具层 (Utility Layer)

| 模块 | 文件 | 功能 |
|------|------|------|
| 国际化 | `i18n.js` | 中英文双语翻译 |
| Excel 工具 | `excelUtils.js` | 导入/导出/模板下载 |

## 关键算法流程

```
Input: S (Total Equity Value), {Classes}, σ, r, T
  │
  ├─ Step 1: Sort classes by seniority (descending)
  │
  ├─ Step 2: Build breakpoint matrix
  │   ├─ Add 0
  │   ├─ Add cumulative liquidation preferences
  │   ├─ Add ESOP strike prices
  │   └─ Add S (total equity value)
  │   └─ Sort ascending → [K₀, K₁, ..., Kₙ]
  │
  ├─ Step 3: For each Kᵢ, compute C(Kᵢ) = BS(S, Kᵢ, T, r, σ)
  │
  ├─ Step 4: For each interval [Kᵢ₋₁, Kᵢ]:
  │   ├─ Vᵢ = C(Kᵢ₋₁) - C(Kᵢ)
  │   ├─ Determine eligible classes (pref ≤ Kᵢ)
  │   ├─ Compute dynamic shares (ESOP: only if strike ≤ Kᵢ₋₁)
  │   └─ Allocate Vᵢ pro-rata by dynamic shares
  │
  └─ Step 5: Aggregate per-class totals across all intervals
      └─ Validate: Σ totalValue = S
```

## 技术栈

| 技术 | 用途 |
|------|------|
| React 18 + Vite | 前端框架与构建工具 |
| Tailwind CSS 3 | 样式系统（Apple 风格） |
| Lucide React | 图标库 |
| xlsx (SheetJS) | Excel 文件读写 |
| JavaScript (ES6+) | 编程语言 |

## 安全特性

- **纯前端计算**：所有数据在浏览器内存中处理，不上传至任何服务器
- **无外部依赖**：除 CDN 加载的库外，无任何网络请求
- **本地存储**：支持 localStorage 保存/恢复会话状态
