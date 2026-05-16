# 断点计算逻辑 (Breakpoint Logic)

## 概述

断点（Breakpoint）是 OPM 模型中最核心的概念。它将企业总权益价值 $S$ 划分为多个连续的区间（Tranche），每个区间对应一个特定的价值范围。通过 Black-Scholes 模型计算每个区间的增量价值，再按瀑布规则（Waterfall Rules）分配给各证券持有者。

## 核心概念：Per-share Strike Price vs Aggregate Enterprise Value Breakpoint

### 关键区别

| 概念 | 含义 | 示例 |
|------|------|------|
| **Per-share Strike Price** | ESOP 每股行权价 | $0.50/share |
| **Aggregate Enterprise Value Breakpoint** | 企业总价值阈值 | $7,500,000 |

### 转换公式

ESOP 的每股行权价必须转换为企业总价值断点：

$$
BP_{ESOP} = \sum \text{Liquidation Pref} + (\text{Strike Price} \times \text{Active Common Shares})
$$

其中：
- $\sum \text{Liquidation Pref}$ = 所有优先股的清算优先权累积值
- $\text{Strike Price}$ = ESOP 的每股行权价
- $\text{Active Common Shares}$ = 当前活跃的普通股股数

### 为什么需要转换？

在 OPM 模型中，断点代表的是**企业总权益价值的某个阈值**，而 ESOP 的行权价是**每股价格**。两者是不同的维度。

例如：
- ESOP 行权价 = $0.50/share
- Common Shares = 5,000,000
- 这意味着当 Common 股东获得的每股价值达到 $0.50 时，ESOP 进入实值状态
- 对应的企业总价值 = $5,000,000 (清算优先权) + ($0.50 × 5,000,000) = $7,500,000

## 断点矩阵构建

### 构建步骤

```
Algorithm: buildBreakpointMatrix
Input: equityClasses[], totalEquityValue S
Output: sorted breakpoint array K[]

// 第一阶段：清算优先权
1. K ← {0}
2. cumulativePref ← sum of all Preferred liquidation preferences
3. IF cumulativePref > 0: K ← K ∪ {cumulativePref}

// 第二阶段：ESOP 行权触发点（迭代过程）
4. activeCommonShares ← sum of all Common shares
5. FOR each ESOP sorted by exercisePrice (ascending):
6.     triggerEV ← cumulativePref + (exercisePrice × activeCommonShares)
7.     IF triggerEV < S: K ← K ∪ {triggerEV}
8.     activeCommonShares ← activeCommonShares + ESOP shares

// 第三阶段：终点
9. K ← K ∪ {S}
10. RETURN sort(unique(K))
```

### 迭代过程示例

假设：
- Series A Preferred: 1M shares, $5M liquidation preference
- ESOP 1: 0.5M shares, strike = $0.50/share
- ESOP 2: 0.3M shares, strike = $1.00/share
- Common: 5M shares

**迭代步骤：**

| 步骤 | cumulativePref | Active Common Shares | ESOP Strike | Trigger EV |
|------|---------------|---------------------|-------------|------------|
| 初始 | $5,000,000 | 5,000,000 | - | - |
| ESOP 1 | $5,000,000 | 5,000,000 | $0.50 | $5M + ($0.50 × 5M) = **$7,500,000** |
| 解锁后 | $5,000,000 | 5,500,000 | - | - |
| ESOP 2 | $5,000,000 | 5,500,000 | $1.00 | $5M + ($1.00 × 5.5M) = **$10,500,000** |

**断点矩阵：** $\mathbb{K} = [0, 5,000,000, 7,500,000, 10,500,000, S]$

## 瀑布分配规则

### 三层瀑布结构

```
企业总价值 S
│
├── Tranche 1 [0, cumulativePref]
│   100% → Preferred Shares
│   Common 和 ESOP 获得 0
│   （清算优先权要求 Preferred 先获得全额分配）
│
├── Tranche 2 [cumulativePref, BP_ESOP]
│   100% → Common Shares
│   ESOP 有效股数 = 0
│   （ESOP 尚未进入实值状态）
│
└── Tranche 3 [BP_ESOP, S]
   按比例分配 → Common + ESOP
   ESOP 有效股数 = 实际 ESOP 股数
   分母 = Common Shares + ESOP Shares
```

### 分配规则详解

| 区间位置 | 分配规则 | 数学表达 |
|---------|---------|---------|
| $[0, \text{cumulativePref}]$ | 100% 给 Preferred | $A_{\text{Preferred}} = V_i$ |
| $[\text{cumulativePref}, BP_{ESOP}]$ | 100% 给 Common | $A_{\text{Common}} = V_i$ |
| $[BP_{ESOP}, S]$ | 按比例给 Common + ESOP | $A_j = V_i \times \frac{\text{shares}_j}{\text{shares}_{\text{Common}} + \text{shares}_{\text{ESOP}}}$ |

## 完整示例

### 输入参数

| 参数 | 值 |
|------|-----|
| Total Equity Value (S) | $10,000,000 |
| Volatility (σ) | 50% |
| Risk-free Rate (r) | 4% |
| Time to Exit (T) | 3 years |

### 资本结构

| 证券 | 类型 | 股数 | 清算优先权 | 行权价 | 优先级 |
|------|------|------|-----------|--------|--------|
| Series A | Preferred | 1,000,000 | $5,000,000 | - | 3 |
| ESOP | ESOP | 500,000 | $0 | $0.50 | 0 |
| Common | Common | 5,000,000 | $0 | - | 0 |

### 断点计算

- cumulativePref = $5,000,000
- BP_ESOP = $5,000,000 + ($0.50 × 5,000,000) = $7,500,000
- 断点矩阵：$\mathbb{K} = [0, 5,000,000, 7,500,000, 10,000,000]$

### 分配结果

| 区间 | Lower | Upper | V_i | Series A | ESOP | Common |
|------|-------|-------|-----|----------|------|--------|
| 1 | $0 | $5M | $5.00M | **$5.00M** | $0 | $0 |
| 2 | $5M | $7.5M | $2.58M | $0 | $0 | **$2.58M** |
| 3 | $7.5M | $10M | $2.42M | $0 | **$0.22M** | **$2.20M** |
| **合计** | | | **$10.00M** | **$5.00M** | **$0.22M** | **$4.78M** |

> 注意：Tranche 1 中 Series A 获得 100% 分配（清算优先权）。Tranche 2 中 Common 获得 100% 分配（ESOP 尚未解锁）。Tranche 3 中 Common 和 ESOP 按比例分配。
