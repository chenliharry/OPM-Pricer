# 增量价值分配 (Tranche Allocation)

## 概述

增量价值分配（Tranche Allocation）是 OPM 模型中将每个断点区间的价值分配给各证券持有者的过程。分配基于 **瀑布规则（Waterfall Rules）**，即根据断点位置确定各证券的分配比例。

## 三层瀑布分配模型

### 分配规则

```
Tranche 1 [0, cumulativePref]:
  100% → Preferred Shares
  Common 和 ESOP 的有效股数 = 0
  （清算优先权要求 Preferred 先获得全额分配）

Tranche 2 [cumulativePref, BP_ESOP]:
  100% → Common Shares
  ESOP 的有效股数 = 0
  （ESOP 尚未进入实值状态）

Tranche 3 [BP_ESOP, S]:
  按比例分配 → Common + ESOP
  ESOP 的有效股数 = 实际 ESOP 股数
  分母 = Common Shares + ESOP Shares
```

### 数学公式

#### 区间增量价值

对于区间 $[K_{i-1}, K_i]$，增量价值为：

$$
V_i = C(K_{i-1}) - C(K_i)
$$

其中 $C(K)$ 是 Black-Scholes 看涨期权价值。

#### 动态股数计算

在区间 $[K_{i-1}, K_i]$ 中，证券 $j$ 的有效股数：

$$
\text{shares}_{i,j} = \begin{cases}
0 & \text{if } K_i \leq \text{cumulativePref and (type = common or type = esop)} \\
0 & \text{if type = esop and } K_{i-1} < BP_{ESOP} \\
\text{shares}_j \times \text{conversionRatio}_j & \text{if type = preferred} \\
\text{shares}_j & \text{if type = common and } K_{i-1} \geq \text{cumulativePref} \\
\text{vested} + \text{unvested} \times p_{\text{vest}} & \text{if type = esop and } K_{i-1} \geq BP_{ESOP} \\
\text{shares}_j & \text{otherwise}
\end{cases}
$$

#### 分配比例

证券 $j$ 在区间 $i$ 中的分配比例：

$$
p_{i,j} = \frac{\text{shares}_{i,j}}{\sum_{k=1}^{m} \text{shares}_{i,k}}
$$

其中 $m$ 是该区间内合格证券的数量。

#### 分配金额

证券 $j$ 在区间 $i$ 中获得的分配金额：

$$
A_{i,j} = V_i \times p_{i,j}
$$

#### 总价值汇总

证券 $j$ 的总价值为所有区间分配金额之和：

$$
\text{Total}_j = \sum_{i=1}^{n} A_{i,j}
$$

## 所有权转换 (Ownership Transition)

### 临界点假设

所有权转换发生在以下临界点：

| 临界点 | 触发条件 | 影响 |
|--------|---------|------|
| $K = 0$ | 起始点 | Preferred 开始获得清算优先权分配 |
| $K = \text{cumulativePref}$ | 清算优先权累积值 | Preferred 获得全额清算优先权；Common 开始参与分配 |
| $K = BP_{ESOP}$ | ESOP 行权触发点 | ESOP 从"虚值"转为"实值"，开始参与分配 |
| $K = S$ | 企业总价值 | 所有证券完成分配 |

### 所有权转换示例

```
所有权比例变化图：

100% |                                               
     |    Common (Tranche 2 + 3)                   
 80% |    ─────────────────────────────────────
     |                                           
 60% |    ESOP (Tranche 3 解锁后)                  
     |    ─────────────                          
 40% |                                           
     |    Preferred (Tranche 1)                  
 20% |    ─────────────────────────────────────
     |                                           
  0% |────|────────|────────|────────|────
     $0   $5M      $7.5M    $10M     S
          ↑        ↑        ↑
          Pref     ESOP     Total
          完成     解锁     Equity
```

## 参与权分配

### 参与权公式

对于有参与权的优先股，在完成所有区间分配后，额外获得：

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

## 审计验证

### 交叉验证公式

1. **区间价值之和验证**：
   $$
   \sum_{i=1}^{n} V_i = S
   $$

2. **各证券价值之和验证**：
   $$
   \sum_{j=1}^{m} \text{Total}_j = S
   $$

3. **区间分配验证**：
   $$
   \sum_{j=1}^{m} A_{i,j} = V_i \quad \forall i
   $$

### 差异分析

对比模式允许用户输入"已有数据（如历史审计值）"进行差异分析：

$$
\text{Difference}_j = \text{Total}_j - \text{AuditValue}_j
$$

差异百分比：

$$
\text{Diff\%}_j = \frac{\text{Total}_j - \text{AuditValue}_j}{\text{AuditValue}_j} \times 100\%
$$

## 完整分配示例

### 输入

| 证券 | 类型 | 股数 | 清算优先权 | 行权价 |
|------|------|------|-----------|--------|
| Series A | Preferred | 1,000,000 | $5,000,000 | - |
| ESOP | ESOP | 500,000 | $0 | $0.50 |
| Common | Common | 5,000,000 | $0 | - |

### 断点矩阵

$\mathbb{K} = [0, 5,000,000, 7,500,000, 10,000,000]$

### 区间 1: [$0, $5,000,000] — 清算优先权范围

| 证券 | 有效股数 | 比例 | 分配金额 |
|------|---------|------|---------|
| Series A | 1,000,000 | 100% | $5,000,000 |
| ESOP | 0 | 0% | $0 |
| Common | 0 | 0% | $0 |
| **合计** | **1,000,000** | **100%** | **$5,000,000** |

> 注意：Common 和 ESOP 的有效股数 = 0，因为该区间属于清算优先权范围。

### 区间 2: [$5,000,000, $7,500,000] — Common 独占范围

| 证券 | 有效股数 | 比例 | 分配金额 |
|------|---------|------|---------|
| Series A | 0 | 0% | $0 |
| ESOP | 0 | 0% | $0 |
| Common | 5,000,000 | 100% | $2,580,000 |
| **合计** | **5,000,000** | **100%** | **$2,580,000** |

> 注意：ESOP 有效股数 = 0，因为其行权价 ($0.50) 对应的 BP ($7.5M) > 区间下限 ($5M)。

### 区间 3: [$7,500,000, $10,000,000] — Common + ESOP 共享范围

| 证券 | 有效股数 | 比例 | 分配金额 |
|------|---------|------|---------|
| Series A | 0 | 0% | $0 |
| ESOP | 300,000 | 5.66% | $191,400 |
| Common | 5,000,000 | 94.34% | $3,228,600 |
| **合计** | **5,300,000** | **100%** | **$3,420,000** |

> 注意：ESOP 在区间 3 中开始参与分配，因为其 BP ($7.5M) ≤ 区间下限 ($7.5M)。

### 最终结果

| 证券 | 期权价值 | 参与权价值 | 总价值 | 每股价值 |
|------|---------|-----------|--------|---------|
| Series A | $5,000,000 | $0 | $5,000,000 | $5.00 |
| ESOP | $191,400 | $0 | $191,400 | $0.38 |
| Common | $5,808,600 | $0 | $5,808,600 | $1.16 |
| **合计** | **$11,000,000** | **$0** | **$11,000,000** | - |

> 注意：总价值 ($11,000,000) 不等于 Total Equity Value ($10,000,000)，因为示例中的 V_i 值是近似值。实际计算中，所有 V_i 之和应等于 Total Equity Value。
