/**
 * 资本结构层级输入组件
 * 
 * 支持多种股权类型：
 * - Common Stock（普通股）
 * - Preferred Stock（优先股）
 * - ESOP / Stock Options（员工期权计划）
 * - SAFE (Simple Agreement for Future Equity)
 * - Convertible Notes（可转换债券）
 * - Warrants（认股权证）
 * 
 * 特性：
 * - 多语言支持
 * - 智能层级命名
 * - 响应式布局
 */

import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { t, getTypeLabel } from '../utils/i18n';

const EQUITY_TYPES = [
  { value: 'common', color: 'bg-blue-100 text-blue-800' },
  { value: 'preferred', color: 'bg-purple-100 text-purple-800' },
  { value: 'esop', color: 'bg-green-100 text-green-800' },
  { value: 'safe', color: 'bg-orange-100 text-orange-800' },
  { value: 'convertible', color: 'bg-red-100 text-red-800' },
  { value: 'warrant', color: 'bg-yellow-100 text-yellow-800' },
];

function EquityClassInput({ equityClass, onUpdate, onRemove, canRemove, lang }) {
  const [expanded, setExpanded] = useState(true);

  const handleChange = (field, value) => {
    onUpdate(equityClass.id, { [field]: value });
  };

  const getTypeColor = () => {
    const type = EQUITY_TYPES.find(t => t.value === equityClass.type);
    return type ? type.color : 'bg-apple-gray-100 text-apple-gray-800';
  };

  return (
    <div className="bg-apple-gray-50 rounded-xl p-5 border border-apple-gray-200 hover:border-apple-blue-500 transition-all duration-200">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-apple-gray-200 rounded-lg transition-colors"
          >
            {expanded ? <ChevronUp className="w-5 h-5 text-apple-gray-600" /> : <ChevronDown className="w-5 h-5 text-apple-gray-600" />}
          </button>
          <input
            type="text"
            value={equityClass.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="text-lg font-semibold bg-transparent border-b-2 border-transparent hover:border-apple-blue-500 focus:border-apple-blue-500 focus:outline-none text-apple-gray-900 px-2 py-1 transition-colors"
            placeholder={lang === 'en' ? 'Class Name' : '层级名称'}
          />
          {/* 股权类型标签 */}
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTypeColor()}`}>
            {getTypeLabel(equityClass.type, lang)}
          </span>
        </div>
        
        {canRemove && (
          <button
            onClick={() => onRemove(equityClass.id)}
            className="p-2 hover:bg-red-100 rounded-lg transition-colors group"
          >
            <Trash2 className="w-5 h-5 text-apple-gray-400 group-hover:text-red-500" />
          </button>
        )}
      </div>

      {/* 股权类型选择器 */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-apple-gray-600 mb-2">
          {t('equityType', {}, lang)}
        </label>
        <div className="flex flex-wrap gap-2">
          {EQUITY_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => handleChange('type', type.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                equityClass.type === type.value
                  ? 'bg-apple-blue-500 text-white shadow-md'
                  : 'bg-white text-apple-gray-600 border border-apple-gray-300 hover:border-apple-blue-500'
              }`}
            >
              {getTypeLabel(type.value, lang)}
            </button>
          ))}
        </div>
      </div>

      {/* 详细参数 */}
      {expanded && (
        <div className="space-y-4">
          {/* 通用参数 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                {t('shares', {}, lang)}
              </label>
              <input
                type="number"
                value={equityClass.shares}
                onChange={(e) => handleChange('shares', parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                placeholder="0"
              />
            </div>

            {/* 根据类型显示不同参数 */}
            {(equityClass.type === 'common' || equityClass.type === 'preferred') && (
              <>
                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('pricePerShare', {}, lang)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={equityClass.pricePerShare}
                    onChange={(e) => handleChange('pricePerShare', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                    placeholder="0.00"
                  />
                </div>

                {equityClass.type === 'preferred' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                        {t('liqPref', {}, lang)}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={equityClass.liquidationPreference}
                        onChange={(e) => handleChange('liquidationPreference', parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                        placeholder="1.0"
                      />
                      <p className="text-xs text-apple-gray-500 mt-1">
                        {lang === 'en' ? 'Typically 1.0x for Preferred' : '优先股通常为 1.0'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                        {t('conversionRatio', {}, lang)}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={equityClass.conversionRatio}
                        onChange={(e) => handleChange('conversionRatio', parseFloat(e.target.value) || 1)}
                        className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                        placeholder="1.0"
                      />
                    </div>

                    <div className="flex items-center space-x-3 pt-6">
                      <input
                        type="checkbox"
                        id={`participation-${equityClass.id}`}
                        checked={equityClass.participation}
                        onChange={(e) => handleChange('participation', e.target.checked)}
                        className="w-5 h-5 rounded border-apple-gray-300 text-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20"
                      />
                      <label htmlFor={`participation-${equityClass.id}`} className="text-sm font-medium text-apple-gray-700 cursor-pointer">
                        {t('participation', {}, lang)}
                      </label>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ESOP 参数 */}
            {equityClass.type === 'esop' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('exercisePrice', {}, lang)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={equityClass.exercisePrice}
                    onChange={(e) => handleChange('exercisePrice', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-apple-gray-500 mt-1">
                    {lang === 'en' ? 'Price employees pay to exercise' : '员工行权时需要支付的价格'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('vestedPct', {}, lang)}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={equityClass.vestedPercentage}
                      onChange={(e) => handleChange('vestedPercentage', parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                      placeholder="0.50"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-apple-gray-500">
                      {((equityClass.vestedPercentage || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-apple-gray-500 mt-1">
                    {lang === 'en' ? 'Percentage of options that have vested' : '已满足行权条件的期权比例'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('vestingProb', {}, lang)}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={equityClass.probabilityOfVesting}
                      onChange={(e) => handleChange('probabilityOfVesting', parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                      placeholder="0.50"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-apple-gray-500">
                      {((equityClass.probabilityOfVesting || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-apple-gray-500 mt-1">
                    {lang === 'en' ? 'Estimated probability of unvested options vesting' : '未行权期权最终行权的概率估计'}
                  </p>
                </div>
              </>
            )}

            {/* SAFE 参数 */}
            {equityClass.type === 'safe' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('investmentAmount', {}, lang)}
                  </label>
                  <input
                    type="number"
                    value={equityClass.investmentAmount}
                    onChange={(e) => handleChange('investmentAmount', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                    placeholder="1000000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('valuationCap', {}, lang)}
                  </label>
                  <input
                    type="number"
                    value={equityClass.valuationCap}
                    onChange={(e) => handleChange('valuationCap', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                    placeholder="5000000"
                  />
                  <p className="text-xs text-apple-gray-500 mt-1">
                    {lang === 'en' ? 'SAFE valuation cap (optional)' : 'SAFE 的估值上限（可选）'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('discountRate', {}, lang)}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={equityClass.discountRate}
                      onChange={(e) => handleChange('discountRate', parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                      placeholder="0.20"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-apple-gray-500">
                      {((equityClass.discountRate || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-apple-gray-500 mt-1">
                    {lang === 'en' ? 'SAFE discount rate (optional, e.g. 20%)' : 'SAFE 的折扣率（可选，如 20%）'}
                  </p>
                </div>
              </>
            )}

            {/* 可转换债券参数 */}
            {equityClass.type === 'convertible' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('principal', {}, lang)}
                  </label>
                  <input
                    type="number"
                    value={equityClass.principal}
                    onChange={(e) => handleChange('principal', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                    placeholder="1000000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('interestRate', {}, lang)}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={(equityClass.interestRate || 0) * 100}
                      onChange={(e) => handleChange('interestRate', (parseFloat(e.target.value) || 0) / 100)}
                      className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                      placeholder="5"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-apple-gray-500">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('conversionPrice', {}, lang)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={equityClass.conversionPrice}
                    onChange={(e) => handleChange('conversionPrice', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                    placeholder="1.00"
                  />
                  <p className="text-xs text-apple-gray-500 mt-1">
                    {lang === 'en' ? 'Price at which debt converts to equity' : '债券转换为股权的价格'}
                  </p>
                </div>
              </>
            )}

            {/* 认股权证参数 */}
            {equityClass.type === 'warrant' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                    {t('exercisePrice', {}, lang)}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={equityClass.exercisePrice}
                    onChange={(e) => handleChange('exercisePrice', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                    placeholder="1.00"
                  />
                  <p className="text-xs text-apple-gray-500 mt-1">
                    {lang === 'en' ? 'Warrant exercise price' : '认股权证的行权价格'}
                  </p>
                </div>
              </>
            )}

            {/* 优先级 */}
            <div>
              <label className="block text-xs font-medium text-apple-gray-600 mb-2">
                {t('seniority', {}, lang)}
              </label>
              <input
                type="number"
                value={equityClass.seniority}
                onChange={(e) => handleChange('seniority', parseInt(e.target.value) || 0)}
                className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                placeholder="0"
              />
              <p className="text-xs text-apple-gray-500 mt-1">
                {lang === 'en' ? 'Higher number = higher priority' : '数字越大优先级越高'}
              </p>
            </div>
          </div>

          {/* 类型说明 */}
          <div className="p-3 bg-white rounded-lg border border-apple-gray-200">
            <p className="text-xs text-apple-gray-600">
              {equityClass.type === 'common' && t('tipCommon', {}, lang)}
              {equityClass.type === 'preferred' && t('tipPreferred', {}, lang)}
              {equityClass.type === 'esop' && t('tipEsop', {}, lang)}
              {equityClass.type === 'safe' && t('tipSafe', {}, lang)}
              {equityClass.type === 'convertible' && t('tipConvertible', {}, lang)}
              {equityClass.type === 'warrant' && t('tipWarrant', {}, lang)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default EquityClassInput;
