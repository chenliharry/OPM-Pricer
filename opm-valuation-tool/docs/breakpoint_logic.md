# 断点计算逻辑 (Breakpoint Logic)

## 概述

断点（Breakpoint）是 OPM 模型中最核心的概念。它将企业总权益价值 $S$ 划分为多个连续的区间（Tranche），每个区间对应一个特定的价值范围。通过 Black-Scholes 模型计算每个区间的增量价值，再按比例分配给各证券持有者。

## 核心概念：Per-share Strike Price vs Aggregate Enterprise Value Breakpoint

### 关键区别

| 概念 | 含义 | 示例 |
|------|------|------|
| **Per-share Strike Price** | ESOP 每股行权价 | $0.50/share |
| **Aggregate Enterprise Value Breakpoint** | 企业总价值阈值 | $7,500,000 |

### 转换公式

ESOP 的每股行权价必须转换为企业总价值断点：

```
BP_ESOP = cumulativeAbsolutePref + (Strike Price × Active Shares)
```

其中：
- `cumulativeAbsolutePref` = 所有绝对清算优先权的累积值（SAFE 本金 + 可转换债券本金 + 优先股清算优先权）
- `Strike Price` = ESOP 的每股行权价
- `Active Shares` = 当前活跃的总股数（Common + 已解锁 ESOP + 已转股优先股）

### 为什么需要转换？

在 OPM 模型中，断点代表的是**企业总权益价值的某个阈值**，而 ESOP 的行权价是**每股价格**。两者是不同的维度。

例如：
- ESOP 行权价 = $0.50/share
- Common Shares = 5,000,000
- cumulativeAbsolutePref = $5,000,000
- 对应的企业总价值 = $5,000,000 + ($0.50 × 5,000,000) = $7,500,000

## 高级断点矩阵构建（Mercer Capital 合规）

### 算法步骤

```
Algorithm: buildAdvancedBreakpointMatrix (Fully Diluted & Mercer Capital Compliant)
Input: equityClasses[], totalEquityValue S
Output: sorted breakpoint array K[]

// 第一阶段：绝对清算优先权累积 (Absolute Seniority Claims)
1. K ← {0}
2. cumulativeAbsolutePref ← sum(SAFE.principal) + sum(CN.principal) + sum(All Preferred.liquidationPreference)
3. IF cumulativeAbsolutePref > 0: K ← K ∪ {cumulativeAbsolutePref}

// 第二阶段：初始化普通股及带参与权证券的分母
4. activeShares ← sum(Common.shares) + sum(ParticipatingPreferred.shares)

// 第三阶段：迭代处理多层 ESOP 行权点与不带参与权优先股的"自动转股点"
5. sortedPerShareEvents ← sort(all ESOPs and Non-Participating Preferreds by triggerPrice ascending)
6. FOR each event in sortedPerShareEvents:
7.     triggerEV ← cumulativeAbsolutePref + (event.triggerPrice × activeShares)
8.     K ← K ∪ {triggerEV}
9.     IF event.type == 'esop':
10.        activeShares ← activeShares + event.shares
11.    ELSE IF event.type == 'non_participating_preferred':
12.        cumulativeAbsolutePref ← cumulativeAbsolutePref - event.liquidationPreference
13.        activeShares ← activeShares + event.shares

// 第四阶段：并入当前企业实际总价值终点
14. K ← K ∪ {S}
15. RETURN sort(unique(K))
```

### 关键改进

#### 1. 绝对清算优先权累积

包含所有"绝对优先"的债权/优先权：
- **SAFE 本金**（投资金额）
- **可转换债券本金**（含应计利息）
- **所有优先股的清算优先权**（liquidationPreference × shares × pricePerShare）

这些是瀑布最上层的分配，Common 和 ESOP 必须等这些优先权被满足后才能参与分配。

#### 2. 参与权优先股直接计入分母

参与权优先股（Participating Preferred）从一开始就参与剩余价值分配，其股数直接加入 `activeShares` 基础分母。

#### 3. 非参与权优先股的自动转股

当转股价值等于清算优先权时，非参与权优先股自动转换为普通股：
- 转股触发价 = liquidationPreference / shares
- 转股后，清算优先权从 `cumulativeAbsolutePref` 中扣除
- 股数流入 `activeShares` 分母

#### 4. 多层 ESOP 阶梯触发

每个 ESOP 批次按行权价升序排列，每解锁一个 ESOP，其股数流入分母，稀释后续区间。

### 迭代过程示例

假设：
- Series A Preferred (Non-participating): 1M shares, $5M liquidation preference
- ESOP 1: 0.5M shares, strike = $0.50/share
- ESOP 2: 0.3M shares, strike = $1.00/share
- Common: 5M shares

**迭代步骤：**

| 步骤 | cumulativeAbsolutePref | Active Shares | Event | Trigger Price | Trigger EV |
|------|----------------------|--------------|-------|---------------|------------|
| 初始 | $5,000,000 | 5,000,000 | - | - | - |
| ESOP 1 | $5,000,000 | 5,000,000 | ESOP | $0.50 | $5M + ($0.50 × 5M) = **$7,500,000** |
| 解锁后 | $5,000,000 | 5,500,000 | - | - | - |
| ESOP 2 | $5,000,000 | 5,500,000 | ESOP | $1.00 | $5M + ($1.00 × 5.5M) = **$10,500,000** |
| 解锁后 | $5,000,000 | 5,800,000 | - | - | - |
| Series A | $5,000,000 | 5,800,000 | Non-Part | $5.00 | $5M + ($5.00 × 5.8M) = **$34,000,000** |
| 转股后 | **$0** | **6,800,000** | - | - | - |

**断点矩阵：** `K = [0, 5,000,000, 7,500,000, 10,500,000, 34,000,000, S]`

## 完全比例分配

### 分配规则

每个 Tranche 的价值按该区间内所有活跃证券的有效股数比例分配：

```
A_{i,j} = V_i × shares_{i,j} / sum(shares_{i,k} for k=1..m)
```

其中：
- `A_{i,j}` = 证券 j 在区间 i 中的分配金额
- `V_i` = 区间 i 的增量价值 = C(Lower_i) - C(Upper_i)
- `shares_{i,j}` = 证券 j 在区间 i 中的有效股数
- `m` = 该区间内活跃证券的数量

### 动态股数计算

| 证券类型 | 有效股数规则 |
|---------|-------------|
| Common | 在清算优先权范围内（upper ≤ cumulativeAbsolutePref）为 0，否则按实际股数 |
| ESOP | 在清算优先权范围内为 0；否则只有行权价 ≤ lower 时才计入 |
| Participating Preferred | 始终按转股比例计入（即使在清算优先权范围内） |
| Non-participating Preferred | 转股前按转股比例计入，转股后按实际股数计入 |
| SAFE/Convertible/Warrant | 按 shares 字段计入 |

## 完整示例

### 输入参数

| 参数 | 值 |
|------|-----|
| Total Equity Value (S) | $10,000,000 |
| Volatility (σ) | 50% |
| Risk-free Rate (r) | 4% |
| Time to Exit (T) | 3 years |

### 资本结构

| 证券 | 类型 | 股数 | 清算优先权 | 行权价 | 参与权 |
|------|------|------|-----------|--------|--------|
| Series A | Preferred (Non-part) | 1,000,000 | $5,000,000 | - | No |
| ESOP | ESOP | 500,000 | $0 | $0.50 | - |
| Common | Common | 5,000,000 | $0 | - | - |

### 断点计算

- cumulativeAbsolutePref = $5,000,000
- activeShares = 5,000,000 (仅 Common)
- BP_ESOP = $5,000,000 + ($0.50 × 5,000,000) = $7,500,000
- BP_SeriesA = $5,000,000 + ($5.00 × 5,500,000) = $32,500,000
- 断点矩阵：`K = [0, 5,000,000, 7,500,000, 10,000,000]`

### 分配结果

| 区间 | Lower | Upper | V_i | Series A | ESOP | Common |
|------|-------|-------|-----|----------|------|--------|
| 1 | $0 | $5M | $5.00M | **$5.00M** | $0 | $0 |
| 2 | $5M | $7.5M | $2.58M | $0 | $0 | **$2.58M** |
| 3 | $7.5M | $10M | $2.42M | $0 | **$0.22M** | **$2.20M** |
| **合计** | | | **$10.00M** | **$5.00M** | **$0.22M** | **$4.78M** |

> 注意：Tranche 1 中 Series A 获得 100% 分配（清算优先权）。Tranche 2 中 Common 获得 100% 分配（ESOP 尚未解锁）。Tranche 3 中 Common 和 ESOP 按比例分配。
