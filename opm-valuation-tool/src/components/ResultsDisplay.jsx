/**
 * 估值结果显示组件
 * 
 * 展示 OPM 估值计算结果，包括：
 * 1. 断点分配详情表（Breakpoint Allocation Table）- 展示每一层断点的详细参数
 *    每一行明确显示该比例（Pro-rata）具体归属于哪个股权类别
 *    点击断点行高亮显示该层分配给了哪些 Class
 * 2. 权益价值分配汇总（OPM Fair Value Summary Table）
 *    展示各层级的核心总价值、股本数量、初始每股价值
 *    当 isDLOMEnabled 时，额外展示 Class 波动率、DLOM 比例、折价后每股参考价
 * 
 * 四大审计实务要求：
 * - 断点分配表必须完整展示每一层的分配逻辑
 * - 汇总行验证分配总额等于 Total Equity Value
 * - 权益价值分配汇总中 Row 1 加总严格等于 Total Equity Value S（价值守恒）
 * - DLOM 行属于独立流动性风险扣减，不参与全局价值守恒校验
 */

import { useState } from 'react';
import { BarChart3, HelpCircle } from 'lucide-react';
import { t } from '../utils/i18n';

function ResultsDisplay({ results, parameters, breakpointTable, totalAllocated, lang, isDLOMEnabled }) {
  const [hoveredTranche, setHoveredTranche] = useState(null);
  const [selectedTranche, setSelectedTranche] = useState(null);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatNumber = (value, decimals = 2) => {
    if (value === Infinity) return '∞';
    if (value === -Infinity) return '-∞';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  const formatPercent = (value) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const totalValue = results.reduce((sum, r) => sum + r.totalValue, 0);

  return (
    <div className="space-y-6">
      {/* ============================================================
          断点分配详情表 (Breakpoint Allocation Table)
          
          这是 OPM 估值中最核心的审计追溯工具。
          表格展示每个断点区间（Tranche）的：
          - 上下限 (Lower/Upper Bound)
          - 行权价 (Strike Price K)
          - 期权价值 C(K)
          - 该层分配额 (Tranche Value)
          - 各资产类别分配比例和金额（明确显示归属关系）
          - d1, d2, N(d1), N(d2) 中间参数
          
          点击某一行可高亮显示该层分配给了哪些 Class。
          鼠标悬停可查看计算公式。
          ============================================================ */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-apple-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <BarChart3 className="w-6 h-6 text-apple-blue-500" />
            <h2 className="text-xl font-semibold text-apple-gray-900">
              {t('breakpointTable', {}, lang)}
            </h2>
          </div>
        </div>

        {/* 汇总信息卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-apple-blue-500 to-apple-blue-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-90 mb-1">{t('totalValue', {}, lang)}</p>
            <p className="text-xl font-bold">{formatCurrency(parameters.totalEquityValue)}</p>
          </div>
          
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-90 mb-1">{t('allocatedValue', {}, lang)}</p>
            <p className="text-xl font-bold">{formatCurrency(totalAllocated)}</p>
          </div>
          
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-90 mb-1">{t('numClasses', {}, lang)}</p>
            <p className="text-xl font-bold">{results.length}</p>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-90 mb-1">{t('bpTrancheValue', {}, lang)}</p>
            <p className="text-xl font-bold">{breakpointTable.length}</p>
          </div>
        </div>

        {/* 断点分配表 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-apple-gray-200">
                <th className="text-left py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpLower', {}, lang)}
                </th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpUpper', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpStrike', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpCallValue', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpTrancheValue', {}, lang)}
                </th>
                {/* 为每个结果类添加分配列 - 明确显示归属关系 */}
                {results.map((result, rIdx) => (
                  <th key={rIdx} className="text-center py-3 px-2 text-xs font-semibold text-apple-gray-700 whitespace-nowrap" colSpan={2}>
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] opacity-75">{result.type}</span>
                      <span className="text-xs">{result.className}</span>
                    </div>
                  </th>
                ))}
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpD1', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpD2', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpNd1', {}, lang)}
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {t('bpNd2', {}, lang)}
                </th>
              </tr>
            </thead>
            <tbody>
              {breakpointTable.map((tranche, index) => (
                <tr 
                  key={index} 
                  className={`border-b border-apple-gray-100 transition-colors cursor-pointer ${
                    selectedTranche === index 
                      ? 'bg-apple-blue-100 ring-2 ring-inset ring-apple-blue-500' 
                      : hoveredTranche === index 
                        ? 'bg-apple-blue-50' 
                        : 'hover:bg-apple-gray-50'
                  }`}
                  onMouseEnter={() => setHoveredTranche(index)}
                  onMouseLeave={() => setHoveredTranche(null)}
                  onClick={() => setSelectedTranche(selectedTranche === index ? null : index)}
                >
                  <td className="py-3 px-3 font-mono text-xs text-apple-gray-700">
                    {formatCurrency(tranche.lower)}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-apple-gray-700 relative group">
                    <span className={`cursor-help border-b border-dotted ${tranche.isTailTranche ? 'border-purple-400 text-purple-600' : 'border-apple-gray-400'}`}>
                      {tranche.upper === Infinity ? '∞' : formatCurrency(tranche.upper)}
                    </span>
                    {/* 悬停显示断点计算说明 */}
                    {/* 注意：lowerExplanation 对应的是当前 tranche 的 lower 断点 */}
                    {/* 即该 tranche 的"入口"断点，定义了该区间从何处开始 */}
                    {tranche.lowerExplanation && (
                      <div className="absolute z-20 hidden group-hover:block left-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-apple-gray-200 p-4 w-96 text-left animate-fade-in">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-apple-gray-900 mb-2">
                            {lang === 'en' ? 'Breakpoint Calculation' : '断点计算说明'}
                          </p>
                          {tranche.lowerExplanation.type === 'seniority' ? (
                            <>
                              <p className="text-xs font-medium text-apple-blue-600">
                                {lang === 'en' ? `Seniority ${tranche.lowerExplanation.seniority} Liquidation Preference` : `优先级 ${tranche.lowerExplanation.seniority} 清算优先权`}
                              </p>
                              <div className="bg-apple-gray-50 rounded-lg p-2 space-y-1">
                                {tranche.lowerExplanation.details.map((d, idx) => (
                                  <p key={idx} className="text-xs font-mono text-apple-gray-700">
                                    {d.name}: {d.shares.toLocaleString()} shares × ${d.pricePerShare} = <span className="font-semibold text-green-600">${d.amount.toLocaleString()}</span>
                                  </p>
                                ))}
                              </div>
                              <p className="text-xs font-mono text-apple-gray-700 pt-1">
                                {lang === 'en' ? 'Total:' : '合计:'} <span className="font-semibold text-apple-gray-900">${tranche.lowerExplanation.total.toLocaleString()}</span>
                              </p>
                              {/* 如果该断点同时也是事件断点，追加事件信息 */}
                              {tranche.lowerExplanation.eventLabel && (
                                <>
                                  <div className="border-t border-apple-gray-200 my-2"></div>
                                  <p className="text-xs font-medium text-apple-blue-600">
                                    {tranche.lowerExplanation.eventLabel}
                                  </p>
                                  <div className="bg-apple-gray-50 rounded-lg p-2 space-y-0.5">
                                    {tranche.lowerExplanation.eventFormula.split('\n').map((line, idx) => (
                                      <p key={idx} className="text-xs font-mono text-apple-gray-700">
                                        {line}
                                      </p>
                                    ))}
                                  </div>
                                </>
                              )}
                            </>
                          ) : tranche.lowerExplanation.type === 'fully_diluted' ? (
                            <>
                              <p className="text-xs font-medium text-apple-blue-600">
                                {lang === 'en' ? 'Fully Diluted Breakpoint' : '完全稀释断点'}
                              </p>
                              <div className="bg-apple-gray-50 rounded-lg p-2 space-y-0.5">
                                {tranche.lowerExplanation.formula.split('\n').map((line, idx) => (
                                  <p key={idx} className="text-xs font-mono text-apple-gray-700">
                                    {line}
                                  </p>
                                ))}
                              </div>
                              <p className="text-xs font-mono text-apple-gray-700 pt-1">
                                BP = <span className="font-semibold text-green-600">${tranche.lowerExplanation.total.toLocaleString()}</span>
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-medium text-apple-blue-600">
                                {tranche.lowerExplanation.label}
                              </p>
                              <div className="bg-apple-gray-50 rounded-lg p-2 space-y-0.5">
                                {tranche.lowerExplanation.formula.split('\n').map((line, idx) => (
                                  <p key={idx} className="text-xs font-mono text-apple-gray-700">
                                    {line}
                                  </p>
                                ))}
                              </div>
                              <p className="text-xs font-mono text-apple-gray-700 pt-1">
                                BP = <span className="font-semibold text-green-600">${tranche.lowerExplanation.total.toLocaleString()}</span>
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-apple-gray-700">
                    {formatCurrency(tranche.lowerOption.strikePrice)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-apple-blue-600 font-medium">
                    {formatCurrency(tranche.lowerOption.value)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-green-600 font-semibold relative">
                    {formatCurrency(tranche.trancheValue)}
                    {/* 悬停显示计算公式 */}
                    {hoveredTranche === index && (
                      <div className="absolute z-10 left-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-apple-gray-200 p-3 w-80 text-left animate-fade-in">
                        <p className="text-xs font-mono text-apple-gray-700 leading-relaxed">
                          <span className="font-semibold text-apple-gray-900">{t('bpFormula', {}, lang)}</span><br/>
                          {tranche.isTailTranche ? (
                            <>
                              C({formatCurrency(tranche.lower)}) - C(∞)<br/>
                              = {formatCurrency(tranche.lowerOption.value)} - 0<br/>
                              = <span className="text-green-600 font-bold">{formatCurrency(tranche.trancheValue)}</span>
                            </>
                          ) : (
                            <>
                              C({formatCurrency(tranche.upper)}) - C({formatCurrency(tranche.lower)})<br/>
                              = {formatCurrency(tranche.upperOption.value)} - {formatCurrency(tranche.lowerOption.value)}<br/>
                              = <span className="text-green-600 font-bold">{formatCurrency(tranche.trancheValue)}</span>
                            </>
                          )}
                        </p>
                      </div>
                    )}
                  </td>
                  {/* 各层级分配比例和金额 - 明确显示归属 */}
                  {results.map((result, rIdx) => {
                    const allocation = tranche.allocations.find(a => a.className === result.className);
                    const isHighlighted = selectedTranche === index && allocation;
                    return (
                      <td key={rIdx} colSpan={2} className={`py-3 px-2 text-center ${isHighlighted ? 'bg-apple-blue-200/50' : ''}`}>
                        {allocation ? (
                          <div className="relative group">
                            <div className="flex flex-col items-center">
                              <span className="text-xs font-mono text-apple-gray-700">
                                {formatPercent(allocation.proportion)}
                              </span>
                              <span className="text-xs font-mono text-green-600 font-semibold">
                                {formatCurrency(allocation.amount)}
                              </span>
                            </div>
                            {/* 悬停显示分配详情 */}
                            <div className="absolute z-10 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white rounded-lg shadow-lg border border-apple-gray-200 p-2 whitespace-nowrap">
                              <p className="text-xs font-mono text-apple-gray-700">
                                <span className="font-semibold">{allocation.className}</span><br/>
                                {lang === 'en' ? 'Allocation %' : '分配比例'}: {formatPercent(allocation.proportion)}<br/>
                                {lang === 'en' ? 'Amount' : '分配金额'}: <span className="text-green-600 font-semibold">{formatCurrency(allocation.amount)}</span>
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-apple-gray-400">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 px-3 text-right font-mono text-xs text-apple-gray-700">
                    {formatNumber(tranche.lowerOption.d1, 4)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-apple-gray-700">
                    {formatNumber(tranche.lowerOption.d2, 4)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-green-600">
                    {formatNumber(tranche.lowerOption.Nd1, 4)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs text-green-600">
                    {formatNumber(tranche.lowerOption.Nd2, 4)}
                  </td>
                </tr>
              ))}
              {/* 汇总行 */}
              <tr className="bg-apple-gray-50 font-semibold">
                <td colSpan="4" className="py-3 px-3 text-sm text-apple-gray-900">
                  {t('totalAllocated', {}, lang)}
                </td>
                <td className="py-3 px-3 text-right text-sm text-green-600 font-bold">
                  {formatCurrency(totalAllocated)}
                </td>
                <td colSpan={results.length * 2 + 6} className="py-3 px-3 text-xs text-apple-gray-500">
                  {lang === 'en' 
                    ? `Difference: ${formatCurrency(parameters.totalEquityValue - totalAllocated)}`
                    : `差异: ${formatCurrency(parameters.totalEquityValue - totalAllocated)}`
                  }
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 选中断点行的分配详情面板 */}
        {selectedTranche !== null && breakpointTable[selectedTranche] && (
          <div className="mt-4 p-4 bg-apple-blue-50 rounded-xl border border-apple-blue-200 animate-fade-in">
            <h4 className="font-semibold text-apple-blue-900 mb-3">
              {lang === 'en' ? `Tranche ${selectedTranche + 1} Allocation Details` : `第 ${selectedTranche + 1} 层分配详情`}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {breakpointTable[selectedTranche].allocations.map((alloc, aIdx) => (
                <div key={aIdx} className="bg-white rounded-lg p-3 border border-apple-blue-200 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm text-apple-gray-900">{alloc.className}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-apple-blue-100 text-apple-blue-700">
                      {alloc.type}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-apple-gray-600">
                    <div className="flex justify-between">
                      <span>{lang === 'en' ? 'Shares:' : '股本:'}</span>
                      <span className="font-mono">{formatNumber(alloc.shares, 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{lang === 'en' ? 'Conversion Ratio:' : '转股比例:'}</span>
                      <span className="font-mono">{alloc.conversionRatio}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{lang === 'en' ? 'Allocation %:' : '分配比例:'}</span>
                      <span className="font-mono text-apple-blue-600">{formatPercent(alloc.proportion)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-apple-gray-200">
                      <span className="font-semibold">{lang === 'en' ? 'Amount:' : '分配金额:'}</span>
                      <span className="font-mono font-semibold text-green-600">{formatCurrency(alloc.amount)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================
          权益价值分配汇总 (OPM Fair Value Summary Table)
          
          展示各层级的核心公允价值指标。
          
          当 isDLOMEnabled === false（默认核心模式）：
          - Row 1: 核心总价值 (Total Value) - 各层级在所有 Tranche 中分配金额的纵向加总
          - Row 2: 股本数量 (Shares) - 各层级已发行/已行权股本
          - Row 3: 初始每股价值 (Per-Share) - 总价值 ÷ 股本数量
          
          当 isDLOMEnabled === true（扩展 DLOM 模式）：
          - Row 4: Class 波动率 (Vol) - 基于 Finnerty 模型的层级特有波动率
          - Row 5: DLOM 比例 (%) - 缺乏市场流通性折扣率
          - Row 6: 折价后每股参考价 (After DLOM) - 初始每股价值 × (1 - DLOM%)
          
          审计提示：
          - Row 1 加总严格等于 Total Equity Value S（价值守恒）
          - Row 4-6 属于独立流动性风险扣减，不参与全局价值守恒校验
          ============================================================ */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-apple-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <BarChart3 className="w-6 h-6 text-apple-blue-500" />
            <h2 className="text-xl font-semibold text-apple-gray-900">
              {lang === 'en' ? 'OPM Fair Value Summary' : '权益价值分配汇总 (OPM Fair Value Summary)'}
            </h2>
          </div>
        </div>

        {/* 审计提示 */}
        <div className={`mb-6 p-4 rounded-xl border ${
          isDLOMEnabled 
            ? 'bg-purple-50 border-purple-200 text-purple-800' 
            : 'bg-apple-blue-50 border-apple-blue-200 text-apple-blue-800'
        }`}>
          <div className="flex items-start space-x-2">
            <HelpCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p className="text-sm leading-relaxed">
              {isDLOMEnabled
                ? (lang === 'en'
                    ? 'This table includes DLOM impact assessment. Rows 1-3 satisfy systematic value conservation (Pre-DLOM). Rows 4-6 represent independent liquidity risk deductions; the post-DLOM per-share reference prices do not participate in global value conservation verification and are for fair value reporting reference only.'
                    : '本表已开启 DLOM 影响测算。前 3 项指标满足系统性价值守恒（Pre-DLOM）；后 3 项指标属于独立流动性风险扣减，折价后的每股参考价不参与全局价值守恒校验，仅供公允价值申报参考。')
                : (lang === 'en'
                    ? 'This table shows Pre-DLOM core fair value. The sum of Row 1 (Total Value) across all classes exactly equals the Total Equity Value S (value conservation).'
                    : '本表展示 Pre-DLOM 核心公允价值。各 Class 的【1. 核心总价值】加总严格等于企业当前总体权益价值 S（价值守恒）。')
              }
            </p>
          </div>
        </div>

        {/* 权益价值分配汇总表 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-apple-gray-200">
                <th className="text-left py-3 px-4 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                  {lang === 'en' ? 'Metric' : '财务结算指标'}
                </th>
                {results.map((result, rIdx) => (
                  <th key={rIdx} className="text-center py-3 px-4 text-xs font-semibold text-apple-gray-700 whitespace-nowrap">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] opacity-75">{result.type}</span>
                      <span className="text-xs">{result.className}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Row 1: 核心总价值 (Total Value) */}
              <tr className="border-b border-apple-gray-100 hover:bg-apple-gray-50 transition-colors">
                <td className="py-4 px-4 font-semibold text-apple-gray-900 whitespace-nowrap">
                  {lang === 'en' ? '1. Total Value' : '1. 核心总价值 (Total Value)'}
                </td>
                {results.map((result, rIdx) => (
                  <td key={rIdx} className="py-4 px-4 text-center font-mono font-semibold text-apple-gray-900">
                    {formatCurrency(result.totalValue)}
                  </td>
                ))}
              </tr>
              {/* Row 1 审计验证行：加总 = S */}
              <tr className="border-b border-apple-gray-100 bg-apple-gray-50/50">
                <td className="py-2 px-4 text-xs text-apple-gray-500 italic">
                  {lang === 'en' ? 'Sum check (must equal S):' : '加总校验（应等于 S）:'}
                </td>
                <td colSpan={results.length} className="py-2 px-4 text-center text-xs font-mono">
                  <span className={Math.abs(totalValue - parameters.totalEquityValue) < 1 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {formatCurrency(totalValue)}
                    {Math.abs(totalValue - parameters.totalEquityValue) < 1 ? ' ✓' : ` ≠ ${formatCurrency(parameters.totalEquityValue)}`}
                  </span>
                </td>
              </tr>

              {/* Row 2: 股本数量 (Shares) */}
              <tr className="border-b border-apple-gray-100 hover:bg-apple-gray-50 transition-colors">
                <td className="py-4 px-4 font-semibold text-apple-gray-900 whitespace-nowrap">
                  {lang === 'en' ? '2. Shares' : '2. 股本数量 (Shares)'}
                </td>
                {results.map((result, rIdx) => (
                  <td key={rIdx} className="py-4 px-4 text-center font-mono text-apple-gray-700">
                    {formatNumber(result.shares, 0)}
                  </td>
                ))}
              </tr>

              {/* Row 3: 初始每股价值 (Per-Share) */}
              <tr className="border-b border-apple-gray-100 hover:bg-apple-gray-50 transition-colors">
                <td className="py-4 px-4 font-semibold text-apple-gray-900 whitespace-nowrap">
                  {lang === 'en' ? '3. Per-Share Value' : '3. 初始每股价值 (Per-Share)'}
                </td>
                {results.map((result, rIdx) => (
                  <td key={rIdx} className="py-4 px-4 text-center font-mono font-bold text-green-600">
                    {formatCurrency(result.valuePerShare)}
                  </td>
                ))}
              </tr>

              {/* DLOM 扩展行（仅当 isDLOMEnabled 时显示） */}
              {isDLOMEnabled && (
                <>
                  {/* Row 4: Class 波动率 (Vol) */}
                  <tr className="border-b border-apple-gray-100 hover:bg-apple-gray-50 transition-colors">
                    <td className="py-4 px-4 font-semibold text-apple-gray-900 whitespace-nowrap">
                      {lang === 'en' ? '4. Class Volatility' : '4. Class 波动率 (Vol)'}
                    </td>
                    {results.map((result, rIdx) => (
                      <td key={rIdx} className="py-4 px-4 text-center font-mono text-purple-700">
                        {result.dlom && result.dlom.classVolatility > 0
                          ? (<span>
                              {formatPercent(result.dlom.classVolatility)}
                              {result.dlom.classVolatilityCapped && (
                                <span className="ml-1 text-orange-500 cursor-help" title={lang === 'en' ? 'Capped at 5× firm volatility for numerical stability' : '已达上限 (5× 企业波动率)，Finnerty 模型在此范围区分度降低'}>
                                  *
                                </span>
                              )}
                            </span>)
                          : '-'}
                      </td>
                    ))}
                  </tr>

                  {/* Row 5: DLOM 比例 (%) */}
                  <tr className="border-b border-apple-gray-100 hover:bg-apple-gray-50 transition-colors">
                    <td className="py-4 px-4 font-semibold text-apple-gray-900 whitespace-nowrap">
                      {lang === 'en' ? '5. DLOM Rate' : '5. DLOM 比例 (%)'}
                    </td>
                    {results.map((result, rIdx) => (
                      <td key={rIdx} className="py-4 px-4 text-center font-mono text-red-600">
                        {result.dlom && result.dlom.dlom > 0
                          ? formatPercent(result.dlom.dlom)
                          : '0.00%'}
                      </td>
                    ))}
                  </tr>

                  {/* Row 6: 折价后每股参考价 (After DLOM) */}
                  <tr className="border-b border-apple-gray-100 hover:bg-apple-gray-50 transition-colors bg-purple-50/50">
                    <td className="py-4 px-4 font-semibold text-apple-gray-900 whitespace-nowrap">
                      {lang === 'en' ? '6. Per-Share After DLOM' : '6. 折价后每股参考价 (After DLOM)'}
                    </td>
                    {results.map((result, rIdx) => {
                      const afterDLOM = result.dlom && result.dlom.dlom > 0
                        ? result.valuePerShare * (1 - result.dlom.dlom)
                        : result.valuePerShare;
                      return (
                        <td key={rIdx} className="py-4 px-4 text-center font-mono font-bold text-purple-700">
                          {formatCurrency(afterDLOM)}
                        </td>
                      );
                    })}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ResultsDisplay;
