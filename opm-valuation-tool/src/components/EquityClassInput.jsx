/**
 * EquityClassInput - 资本结构层级输入组件
 * 
 * Apple 风格设计：
 * - 柔和圆角 (rounded-2xl)
 * - 毛玻璃效果 (backdrop-blur)
 * - 大留白和清晰的信息层级
 * - 流畅的动画过渡
 * 
 * 功能特性：
 * - 支持多种股权类型（Common, Preferred, ESOP, SAFE, Convertible, Warrant）
 * - 每种类型显示不同的参数配置
 * - 智能层级命名（自动根据参数生成描述性名称）
 * - 实时更新父组件状态
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Info } from 'lucide-react';
import { getTypeLabel, t } from '../utils/i18n';

/**
 * 股权类型配置映射表
 * 定义每种类型需要显示的字段和默认值
 */
const typeConfig = {
  common: {
    fields: ['shares', 'pricePerShare'],
    seniority: 0,
    defaultValues: { shares: 0, pricePerShare: 1.0, liquidationPreference: 0, participation: false, conversionRatio: 1.0 }
  },
  preferred: {
    fields: ['shares', 'pricePerShare', 'liquidationPreference', 'conversionRatio', 'participation'],
    seniority: 3,
    defaultValues: { shares: 0, pricePerShare: 1.0, liquidationPreference: 1.0, participation: false, conversionRatio: 1.0 }
  },
  esop: {
    fields: ['shares', 'exercisePrice', 'vestedPercentage', 'probabilityOfVesting'],
    seniority: 0,
    defaultValues: { shares: 0, exercisePrice: 0.5, vestedPercentage: 0.4, probabilityOfVesting: 0.6 }
  },
  safe: {
    fields: ['investmentAmount', 'valuationCap', 'discountRate'],
    seniority: 1,
    defaultValues: { shares: 0, investmentAmount: 500000, valuationCap: 5000000, discountRate: 0.2 }
  },
  convertible: {
    fields: ['principal', 'interestRate', 'conversionPrice', 'shares'],
    seniority: 2,
    defaultValues: { shares: 0, principal: 1000000, interestRate: 0.08, conversionPrice: 2.0 }
  },
  warrant: {
    fields: ['shares', 'exercisePrice'],
    seniority: 0,
    defaultValues: { shares: 0, exercisePrice: 1.0 }
  }
};

/**
 * 字段配置映射表
 * 定义每个字段的标签、类型、步长、最小值和提示信息
 */
const fieldConfig = {
  shares: {
    labelKey: 'shares',
    type: 'number',
    step: 1,
    min: 0,
    tipKey: null
  },
  pricePerShare: {
    labelKey: 'pricePerShare',
    type: 'number',
    step: 0.01,
    min: 0,
    tipKey: null
  },
  liquidationPreference: {
    labelKey: 'liqPref',
    type: 'number',
    step: 0.1,
    min: 0,
    tipKey: null
  },
  conversionRatio: {
    labelKey: 'conversionRatio',
    type: 'number',
    step: 0.1,
    min: 0,
    tipKey: null
  },
  participation: {
    labelKey: 'participation',
    type: 'checkbox',
    step: null,
    min: null,
    tipKey: null
  },
  exercisePrice: {
    labelKey: 'exercisePrice',
    type: 'number',
    step: 0.01,
    min: 0,
    tipKey: null
  },
  vestedPercentage: {
    labelKey: 'vestedPct',
    type: 'number',
    step: 0.01,
    min: 0,
    max: 1,
    tipKey: null
  },
  probabilityOfVesting: {
    labelKey: 'vestingProb',
    type: 'number',
    step: 0.01,
    min: 0,
    max: 1,
    tipKey: null
  },
  investmentAmount: {
    labelKey: 'investmentAmount',
    type: 'number',
    step: 1000,
    min: 0,
    tipKey: null
  },
  valuationCap: {
    labelKey: 'valuationCap',
    type: 'number',
    step: 100000,
    min: 0,
    tipKey: null
  },
  discountRate: {
    labelKey: 'discountRate',
    type: 'number',
    step: 0.01,
    min: 0,
    max: 1,
    tipKey: null
  },
  principal: {
    labelKey: 'principal',
    type: 'number',
    step: 1000,
    min: 0,
    tipKey: null
  },
  interestRate: {
    labelKey: 'interestRate',
    type: 'number',
    step: 0.01,
    min: 0,
    max: 1,
    tipKey: null
  },
  conversionPrice: {
    labelKey: 'conversionPrice',
    type: 'number',
    step: 0.01,
    min: 0,
    tipKey: null
  }
};

function EquityClassInput({ equityClass, onUpdate, onRemove, canRemove, lang }) {
  const [expanded, setExpanded] = useState(true);
  // 跟踪每个字段是否被用户聚焦过（用于清除默认 0）
  const [focusedFields, setFocusedFields] = useState({});

  const handleChange = (field, value) => {
    onUpdate(equityClass.id, { [field]: value });
  };

  // 当用户聚焦输入框时，如果当前值为 0 则清空
  const handleFocus = (field) => {
    if (!focusedFields[field]) {
      setFocusedFields(prev => ({ ...prev, [field]: true }));
      if (equityClass[field] === 0 || equityClass[field] === '0') {
        handleChange(field, '');
      }
    }
  };

  // 当用户离开输入框时，如果为空则恢复为 0
  const handleBlur = (field) => {
    if (equityClass[field] === '' || equityClass[field] === undefined || equityClass[field] === null) {
      handleChange(field, 0);
    }
  };

  const config = typeConfig[equityClass.type] || typeConfig.common;
  const typeTipKey = `tip${equityClass.type.charAt(0).toUpperCase() + equityClass.type.slice(1)}`;

  return (
    <div 
      id={`equity-card-${equityClass.id}`}
      className="bg-white rounded-2xl border border-apple-gray-200 overflow-hidden transition-all duration-300 hover:shadow-md"
    >
      {/* 卡片头部 - 显示层级名称和类型 */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-apple-gray-50 to-white">
        <div className="flex items-center space-x-4 flex-1">
          {/* 展开/折叠按钮 */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-lg hover:bg-apple-gray-100 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4 text-apple-gray-500" /> : <ChevronDown className="w-4 h-4 text-apple-gray-500" />}
          </button>
          
          {/* 层级名称 */}
          <input
            type="text"
            value={equityClass.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="text-lg font-semibold text-apple-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 p-0"
          />
          
          {/* 类型标签 */}
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-apple-blue-50 text-apple-blue-600 border border-apple-blue-100">
            {getTypeLabel(equityClass.type, lang)}
          </span>
        </div>
        
        {/* 操作按钮 */}
        <div className="flex items-center space-x-2">
          {/* 类型选择器 */}
          <select
            value={equityClass.type}
            onChange={(e) => {
              const newType = e.target.value;
              const newConfig = typeConfig[newType] || typeConfig.common;
              // 切换类型时，一次性提交所有更新，避免 React 批量更新问题
              const allUpdates = {
                type: newType,
                seniority: newConfig.seniority,
                ...newConfig.defaultValues
              };
              onUpdate(equityClass.id, allUpdates);
            }}

            className="px-3 py-1.5 text-sm rounded-xl bg-apple-gray-100 border border-apple-gray-200 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
          >
            <option value="common">{t('typeCommon', {}, lang)}</option>
            <option value="preferred">{t('typePreferred', {}, lang)}</option>
            <option value="esop">{t('typeEsop', {}, lang)}</option>
            <option value="safe">{t('typeSafe', {}, lang)}</option>
            <option value="convertible">{t('typeConvertible', {}, lang)}</option>
            <option value="warrant">{t('typeWarrant', {}, lang)}</option>
          </select>
          
          {/* 删除按钮 */}
          {canRemove && (
            <button
              onClick={() => onRemove(equityClass.id)}
              className="p-2 rounded-xl hover:bg-red-50 text-apple-gray-400 hover:text-red-500 transition-all"
              title="Remove"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      {/* 展开的内容区域 */}
      {expanded && (
        <div className="px-6 py-4 space-y-4">
          {/* 类型提示 */}
          {t(typeTipKey, {}, lang) && t(typeTipKey, {}, lang) !== typeTipKey && (
            <div className="flex items-start space-x-2 p-3 rounded-xl bg-apple-blue-50/50 border border-apple-blue-100">
              <Info className="w-4 h-4 text-apple-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-apple-blue-700">{t(typeTipKey, {}, lang)}</p>
            </div>
          )}
          
          {/* 参数字段网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {config.fields.map(field => {
              const fieldConf = fieldConfig[field];
              if (!fieldConf) return null;
              
              if (fieldConf.type === 'checkbox') {
                return (
                  <div key={field} className="flex items-center space-x-3 p-3 rounded-xl bg-apple-gray-50">
                    <input
                      type="checkbox"
                      checked={equityClass[field] || false}
                      onChange={(e) => handleChange(field, e.target.checked)}
                      className="w-5 h-5 rounded-lg border-apple-gray-300 text-apple-blue-500 focus:ring-apple-blue-500 transition-all"
                    />
                    <label className="text-sm font-medium text-apple-gray-700">
                      {t(fieldConf.labelKey, {}, lang)}
                    </label>
                  </div>
                );
              }
              
              return (
                <div key={field} className="space-y-1.5">
                  <label className="block text-sm font-medium text-apple-gray-600">
                    {t(fieldConf.labelKey, {}, lang)}
                  </label>
                  <input
                    type="number"
                    value={equityClass[field] ?? 0}
                    onChange={(e) => handleChange(field, parseFloat(e.target.value) || 0)}
                    onFocus={() => handleFocus(field)}
                    onBlur={() => handleBlur(field)}
                    step={fieldConf.step}
                    min={fieldConf.min}
                    className="w-full px-4 py-2.5 bg-white rounded-lg border border-apple-gray-300 focus:border-apple-blue-500 focus:ring-2 focus:ring-apple-blue-500/20 focus:outline-none transition-all"
                    placeholder="0"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default EquityClassInput;
