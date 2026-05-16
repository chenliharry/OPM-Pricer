# 清算瀑布规则 (Waterfall Rules)

## 概述

清算瀑布（Liquidation Waterfall）定义了企业清算或退出时，各证券持有者获得分配的先后顺序和金额。在 OPM 模型中，瀑布规则决定了每个断点区间（Tranche）的价值如何分配给各证券持有者。

## 优先级排序

### 证券类型优先级

| 优先级 | 证券类型 | 说明 |
|--------|---------|------|
| 最高 | Preferred Stock | 享有清算优先权，优先获得分配 |
| 中 | SAFE / Convertible Note | 介于优先股和普通股之间 |
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

## 三层瀑布分配

### 第一层：清算优先权分配

**区间：** $[0, \text{cumulativePref}]$

**规则：** 100% 价值分配给 Preferred Shares

**条件：** 只有清算优先权 $\leq$ 区间上限的证券参与分配

**数学表达：**
$$
A_{\text{Preferred}} = V_i
$$

**示例：**
- cumulativePref = $5,000,000
- 区间 [$0, $5,000,000] 的增量价值 = $5,000,000
- Series A 获得 $5,000,000（100%）
- Common 和 ESOP 获得 $0

### 第二层：Common 独占分配

**区间：** $[\text{cumulativePref}, BP_{ESOP}]$

**规则：** 100% 价值分配给 Common Shares

**条件：** ESOP 尚未进入实值状态（行权价对应的 BP > 区间下限）

**数学表达：**
$$
A_{\text{Common}} = V_i
$$

**示例：**
- cumulativePref = $5,000,000
- BP_ESOP = $7,500,000
- 区间 [$5,000,000, $7,500,000] 的增量价值 = $2,580,000
- Common 获得 $2,580,000（100%）
- ESOP 获得 $0（尚未解锁）

### 第三层：Common + ESOP 共享分配

**区间：** $[BP_{ESOP}, S]$

**规则：** 按比例分配给 Common 和 ESOP

**条件：** ESOP 已进入实值状态（行权价对应的 BP $\leq$ 区间下限）

**数学表达：**
$$
A_j = V_i \times \frac{\text{shares}_j}{\text{shares}_{\text{Common}} + \text{shares}_{\text{ESOP}}}
$$

**示例：**
- BP_ESOP = $7,500,000
- 区间 [$7,500,000, $10,000,000] 的增量价值 = $3,420,000
- Common (5,000,000 shares): $3,228,600 (94.34%)
- ESOP (300,000 shares): $191,400 (5.66%)

## 参与权分配

### 参与权规则

对于有参与权（Participation）的优先股，在完成所有区间分配后，额外获得：

$$
V_{\text{participation}} = \max(0, S - K_{\text{last}}) \times \frac{\text{classShares}}{\text{totalShares}}
$$

### 参与权示例

| 参数 | 值 |
|------|-----|
| Total Equity Value (S) | $10,000,000 |
| 最后一个断点 ($K_{\text{last}}$) | $10,000,000 |
| Series A 股数 | 1,000,000 |
| 总股数 | 6,000,000 |
| 参与权价值 | $(10M - 10M) \times 1M/6M = \$0$ |

> 注意：当最后一个断点等于 Total Equity Value 时，参与权价值为 0。

## 完整瀑布示例

### 输入

| 证券 | 类型 | 股数 | 清算优先权 | 行权价 | 优先级 |
|------|------|------|-----------|--------|--------|
| Series A | Preferred | 1,000,000 | $5,000,000 | - | 3 |
| ESOP | ESOP | 500,000 | $0 | $0.50 | 0 |
| Common | Common | 5,000,000 | $0 | - | 0 |

### 断点矩阵

$\mathbb{K} = [0, 5,000,000, 7,500,000, 10,000,000]$

### 瀑布分配

```
企业总价值 S = $10,000,000
│
├── Tranche 1 [$0, $5,000,000] (V₁ = $5,000,000)
│   └── 100% → Series A: $5,000,000
│
├── Tranche 2 [$5,000,000, $7,500,000] (V₂ = $2,580,000)
│   └── 100% → Common: $2,580,000
│
└── Tranche 3 [$7,500,000, $10,000,000] (V₃ = $3,420,000)
    ├── Common (5,000,000 shares): $3,228,600 (94.34%)
    └── ESOP (300,000 shares): $191,400 (5.66%)

最终结果：
├── Series A: $5,000,000 ($5.00/share)
├── Common: $5,808,600 ($1.16/share)
└── ESOP: $191,400 ($0.38/share)
```

## 审计验证

### 交叉验证

1. **区间价值之和验证**：
   $$
   V_1 + V_2 + V_3 = \$5,000,000 + \$2,580,000 + \$3,420,000 = \$11,000,000
   $$

2. **各证券价值之和验证**：
   $$
   \text{Series A} + \text{Common} + \text{ESOP} = \$5,000,000 + \$5,808,600 + \$191,400 = \$11,000,000
   $$

3. **区间分配验证**：
   - Tranche 1: Series A = $5,000,000 ✓
   - Tranche 2: Common = $2,580,000 ✓
   - Tranche 3: Common + ESOP = $3,228,600 + $191,400 = $3,420,000 ✓

> 注意：示例中的 V_i 值是近似值。实际计算中，所有 V_i 之和应等于 Total Equity Value。
