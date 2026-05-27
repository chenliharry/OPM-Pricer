/**
 * 参数设置面板组件
 * 
 * 用于调整估值计算的核心参数
 * 支持多语言
 */

import { useState } from 'react';
import { X, Sliders } from 'lucide-react';
import { t } from '../utils/i18n';

function ParametersPanel({ parameters, setParameters, onClose, lang }) {
  // 本地输入值缓存：用于在用户输入过程中保持原始字符串，
  // 避免 parseFloat 将 "0." 或 "" 错误转换为 0
  const [inputCache, setInputCache] = useState({});

  const handleChange = (field, value) => {
    setParameters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 数字输入框的 onChange 处理
  // 解决删除后显示 0 的问题
  const handleNumberChange = (field, rawValue) => {
    setInputCache(prev => ({ ...prev, [field]: rawValue }));
    if (rawValue === '') return;
    const num = parseFloat(rawValue);
    if (!isNaN(num)) {
      handleChange(field, num);
    }
  };

  // 当用户聚焦输入框时，如果当前值为 0 则清空输入缓存
  const handleFocus = (field) => {
    if (!inputCache[field] && (parameters[field] === 0 || parameters[field] === '0')) {
      setInputCache(prev => ({ ...prev, [field]: '' }));
    }
  };

  // 当用户离开输入框时，如果缓存为空则恢复为 0
  const handleBlur = (field) => {
    const cached = inputCache[field];
    if (cached === '' || cached === undefined || cached === null) {
      handleChange(field, 0);
      setInputCache(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // 获取输入框的显示值
  const getInputValue = (field) => {
    if (inputCache[field] !== undefined) return inputCache[field];
    const val = parameters[field];
    return val === 0 || val === '0' ? '' : (val ?? '');
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-apple-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Sliders className="w-6 h-6 text-apple-blue-500" />
          <h2 className="text-xl font-semibold text-apple-gray-900">{t('paramTitle', {}, lang)}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-apple-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-apple-gray-600" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 企业总权益价值 */}
        <div>
          <label className="block text-sm font-medium text-apple-gray-700 mb-2">
            {t('totalEquityValue', {}, lang)}
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-apple-gray-500">$</span>
            <input
              type="number"
              value={getInputValue('totalEquityValue')}
              onChange={(e) => handleNumberChange('totalEquityValue', e.target.value)}
              onFocus={() => handleFocus('totalEquityValue')}
              onBlur={() => handleBlur('totalEquityValue')}
              className="w-full pl-8 pr-4 py-3 bg-white rounded-xl border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
              placeholder="10000000"
            />
          </div>
          <p className="text-xs text-apple-gray-500 mt-2">
            {t('paramDesc1', {}, lang)}
          </p>
        </div>

        {/* 波动率 */}
        <div>
          <label className="block text-sm font-medium text-apple-gray-700 mb-2">
            {t('volatility', {}, lang)}
          </label>
          <div className="space-y-3">
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                max="2"
                value={getInputValue('volatility')}
                onChange={(e) => handleNumberChange('volatility', e.target.value)}
                onFocus={() => handleFocus('volatility')}
                onBlur={() => handleBlur('volatility')}
                className="w-full px-4 py-3 bg-white rounded-xl border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                placeholder="0.50"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-apple-gray-500">
                {(parameters.volatility * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={parameters.volatility}
              onChange={(e) => handleChange('volatility', parseFloat(e.target.value))}
              className="w-full h-2 bg-apple-gray-200 rounded-lg appearance-none cursor-pointer accent-apple-blue-500"
            />
          </div>
          <p className="text-xs text-apple-gray-500 mt-2">
            {t('paramDesc2', {}, lang)}
          </p>
        </div>

        {/* 无风险利率 */}
        <div>
          <label className="block text-sm font-medium text-apple-gray-700 mb-2">
            {t('riskFreeRate', {}, lang)}
          </label>
          <div className="space-y-3">
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0"
                max="0.2"
                value={getInputValue('riskFreeRate')}
                onChange={(e) => handleNumberChange('riskFreeRate', e.target.value)}
                onFocus={() => handleFocus('riskFreeRate')}
                onBlur={() => handleBlur('riskFreeRate')}
                className="w-full px-4 py-3 bg-white rounded-xl border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                placeholder="0.04"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-apple-gray-500">
                {(parameters.riskFreeRate * 100).toFixed(2)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="0.2"
              step="0.001"
              value={parameters.riskFreeRate}
              onChange={(e) => handleChange('riskFreeRate', parseFloat(e.target.value))}
              className="w-full h-2 bg-apple-gray-200 rounded-lg appearance-none cursor-pointer accent-apple-blue-500"
            />
          </div>
          <p className="text-xs text-apple-gray-500 mt-2">
            {t('paramDesc3', {}, lang)}
          </p>
        </div>

        {/* 股息率 */}
        <div>
          <label className="block text-sm font-medium text-apple-gray-700 mb-2">
            {t('dividendYield', {}, lang)}
          </label>
          <div className="space-y-3">
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0"
                max="0.2"
                value={getInputValue('dividendYield')}
                onChange={(e) => handleNumberChange('dividendYield', e.target.value)}
                onFocus={() => handleFocus('dividendYield')}
                onBlur={() => handleBlur('dividendYield')}
                className="w-full px-4 py-3 bg-white rounded-xl border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                placeholder="0.00"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-apple-gray-500">
                {((parameters.dividendYield || 0) * 100).toFixed(2)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="0.2"
              step="0.001"
              value={parameters.dividendYield || 0}
              onChange={(e) => handleChange('dividendYield', parseFloat(e.target.value))}
              className="w-full h-2 bg-apple-gray-200 rounded-lg appearance-none cursor-pointer accent-apple-blue-500"
            />
          </div>
          <p className="text-xs text-apple-gray-500 mt-2">
            {t('paramDesc5', {}, lang)}
          </p>
        </div>

        {/* 预期期限 */}
        <div>
          <label className="block text-sm font-medium text-apple-gray-700 mb-2">
            {t('timeToExit', {}, lang)}
          </label>
          <div className="space-y-3">
            <div className="relative">
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="10"
                value={getInputValue('timeToExit')}
                onChange={(e) => handleNumberChange('timeToExit', e.target.value)}
                onFocus={() => handleFocus('timeToExit')}
                onBlur={() => handleBlur('timeToExit')}
                className="w-full px-4 py-3 bg-white rounded-xl border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                placeholder="3.0"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-apple-gray-500">
                {lang === 'en' ? 'yrs' : '年'}
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={parameters.timeToExit}
              onChange={(e) => handleChange('timeToExit', parseFloat(e.target.value))}
              className="w-full h-2 bg-apple-gray-200 rounded-lg appearance-none cursor-pointer accent-apple-blue-500"
            />
          </div>
          <p className="text-xs text-apple-gray-500 mt-2">
            {t('paramDesc4', {}, lang)}
          </p>
        </div>
      </div>

      {/* 参数说明 */}
      <div className="mt-6 p-4 bg-apple-blue-50 rounded-xl border border-apple-blue-200">
        <h4 className="font-semibold text-apple-blue-900 mb-2 flex items-center space-x-2">
          <span>💡</span>
          <span>{t('paramTips', {}, lang)}</span>
        </h4>
        <ul className="text-sm text-apple-blue-800 space-y-1">
          <li>• <strong>{t('paramTip1', {}, lang)}</strong></li>
          <li>• <strong>{t('paramTip2', {}, lang)}</strong></li>
          <li>• <strong>{t('paramTip3', {}, lang)}</strong></li>
          <li>• {t('paramTip4', {}, lang)}</li>
        </ul>
      </div>
    </div>
  );
}

export default ParametersPanel;
