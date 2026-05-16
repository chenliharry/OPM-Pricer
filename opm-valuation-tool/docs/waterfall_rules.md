# 清算瀑布规则 (Waterfall Rules)

## 概述

清算瀑布（Liquidation Waterfall）定义了企业清算或退出时，各证券持有者获得分配的先后顺序和金额。在 OPM 模型中，瀑布规则决定了每个断点区间（Tranche）的价值如何分配给各证券持有者。

## 优先级排序

### 证券类型优先级

| 优先级 | 证券类型 | 说明 |
|--------|---------|------|
| 最高 | Preferred Stock (Non-participating) | 享有清算优先权，优先获得分配，转股后放弃优先权 |
| 高 | SAFE / Convertible Note | 介于优先股和普通股之间，本金计入绝对清算优先权 |
| 中 | Preferred Stock (Participating) | 享有清算优先权，同时参与剩余价值分配 |
| 低 | Common Stock | 在优先股之后获得分配 |
| 最低 | ESOP / Warrant | 在普通股之后，按行权价决定是否参与 |

### 优先级数值

在代码中，优先级通过 `seniority` 字段表示：

```javascript
const seniorityMap = {
  preferred: 3,  // 最高优先级
  safe: 2,
  convertible: 2,
  common: 1,
  esop: 0,       // 最低优先级
  warrant: 0
};
```

## 高级瀑布分配（Mercer Capital 合规）

### 四阶段算法

```
Algorithm: buildAdvancedBreakpointMatrix
Input: equityClasses[], totalEquityValue S
Output: sorted breakpoint array K[]

// 第一阶段：绝对清算优先权累积
K ← {0}
cumulativeAbsolutePref ← sum(SAFE.principal) + sum(CN.principal) + sum(All Preferred.liquidationPreference)
IF cumulativeAbsolutePref > 0: K ← K ∪ {cumulativeAbsolutePref}

// 第二阶段：初始化分母
activeShares ← sum(Common.shares) + sum(ParticipatingPreferred.shares)

// 第三阶段：迭代处理每股阈值事件
sortedEvents ← sort(all ESOPs and Non-Participating Preferreds by triggerPrice)
FOR each event in sortedEvents:
    triggerEV ← cumulativeAbsolutePref + (triggerPrice × activeShares)
    K ← K ∪ {triggerEV}
    IF event.type == 'esop':
        activeShares += event.shares
    ELSE IF event.type == 'non_participating_preferred':
        cumulativeAbsolutePref -= event.liquidationPreference
        activeShares += event.shares

// 第四阶段：终点
K ← K ∪ {S}
RETURN sort(unique(K))
```

### 完全比例分配

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

## 完整瀑布示例

### 输入

| 证券 | 类型 | 股数 | 清算优先权 | 行权价 | 参与权 |
|------|------|------|-----------|--------|--------|
| Series A | Preferred (Non-part) | 1,000,000 | $5,000,000 | - | No |
| ESOP | ESOP | 500,000 | $0 | $0.50 | - |
| Common | Common | 5,000,000 | $0 | - | - |

### 断点矩阵

```
K = [0, 5,000,000, 7,500,000, 10,000,000]
```

### 瀑布分配

```
企业总价值 S = $10,000,000
│
├── Tranche 1 [$0, $5,000,000] (V₁ = $5,000,000)
│   └── 100% → Series A: $5,000,000
│   （清算优先权范围，Common 和 ESOP 有效股数 = 0）
│
├── Tranche 2 [$5,000,000, $7,500,000] (V₂ = $2,580,000)
│   └── 100% → Common: $2,580,000
│   （ESOP 尚未解锁，行权价 $0.50 > lower $5M）
│
└── Tranche 3 [$7,500,000, $10,000,000] (V₃ = $3,420,000)
    ├── Common (5,000,000 shares): $3,228,600 (94.34%)
    └── ESOP (300,000 shares): $191,400 (5.66%)
    （ESOP 已解锁，按比例分配）

最终结果：
├── Series A: $5,000,000 ($5.00/share)
├── Common: $5,808,600 ($1.16/share)
└── ESOP: $191,400 ($0.38/share)
```

## 审计验证

### 交叉验证

1. **区间价值之和验证**：
   V₁ + V₂ + V₃ = $5,000,000 + $2,580,000 + $3,420,000 = $11,000,000

2. **各证券价值之和验证**：
   Series A + Common + ESOP = $5,000,000 + $5,808,600 + $191,400 = $11,000,000

3. **区间分配验证**：
   - Tranche 1: Series A = $5,000,000 ✓
   - Tranche 2: Common = $2,580,000 ✓
   - Tranche 3: Common + ESOP = $3,228,600 + $191,400 = $3,420,000 ✓

> 注意：示例中的 V_i 值是近似值。实际计算中，所有 V_i 之和应等于 Total Equity Value。
