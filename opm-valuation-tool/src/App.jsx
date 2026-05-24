/**
 * OPM 估值工具 - 主应用组件
 * 
 * Apple 风格设计特点：
 * - 极简主义布局
 * - 柔和圆角和阴影
 * - 高斯模糊背景
 * - 流畅的动画过渡
 * 
 * 功能特性：
 * - 多语言支持（中英文切换）
 * - 智能层级命名
 * - 断点分配详情表
 * - Excel 导入/导出（含全局参数）
 */

import { useState, useEffect, useRef } from 'react';
import { Calculator, Upload, Download, FileSpreadsheet, TrendingUp, Settings, Info, Plus, Globe } from 'lucide-react';
import { performOPMValuation } from './utils/valuationUtils';
import { importFromExcel, exportToExcel, downloadTemplate } from './utils/excelUtils';
import { t, generateSmartName } from './utils/i18n';
import EquityClassInput from './components/EquityClassInput';
import ResultsDisplay from './components/ResultsDisplay';
import ParametersPanel from './components/ParametersPanel';

function App() {
  // 语言状态
  const [lang, setLang] = useState('zh');
  // 引用最后一个添加的层级，用于滚动动画
  const lastAddedRef = useRef(null);
  // 动画状态：新添加的层级 ID
  const [animatingId, setAnimatingId] = useState(null);

  // 状态管理 - 包含多种股权类型的示例数据
  const [equityClasses, setEquityClasses] = useState([

    {
      id: 'equity-1',
      name: 'Series A Preferred',
      type: 'preferred',
      shares: 1000000,
      pricePerShare: 1.00,
      liquidationPreference: 1.0,
      participation: false,
      conversionRatio: 1.0,
      seniority: 3
    },
    {
      id: 'equity-2',
      name: 'ESOP Pool',
      type: 'esop',
      shares: 500000,
      exercisePrice: 0.50,
      vestedPercentage: 0.40,
      probabilityOfVesting: 0.60,
      seniority: 2
    },
    {
      id: 'equity-3',
      name: 'Common Stock',
      type: 'common',
      shares: 5000000,
      pricePerShare: 0.10,
      liquidationPreference: 0,
      participation: false,
      conversionRatio: 1.0,
      seniority: 0
    }
  ]);

  // 估值参数（含股息率和 DLOM 参数）
  const [parameters, setParameters] = useState({
    totalEquityValue: 10000000, // $10M
    volatility: 0.50, // 50%
    riskFreeRate: 0.04, // 4%
    timeToExit: 3.0, // 3 years
    dividendYield: 0.00 // 股息率 0%
  });

  // 估值结果（包含断点分配表）
  const [valuationResult, setValuationResult] = useState({
    results: [],
    breakpointTable: [],
    totalAllocated: 0
  });

  // UI 状态
  const [showParameters, setShowParameters] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isDLOMEnabled, setIsDLOMEnabled] = useState(false);

  // 自动计算估值
  useEffect(() => {
    if (equityClasses.length > 0) {
      try {
        const result = performOPMValuation(
          parameters.totalEquityValue,
          equityClasses,
          parameters.volatility,
          parameters.riskFreeRate,
          parameters.timeToExit,
          parameters.dividendYield || 0
        );
        setValuationResult(result);
      } catch (error) {
        showNotification(t('calcError', { msg: error.message }, lang), 'error');
      }
    }
  }, [equityClasses, parameters, lang]);

  // 显示通知
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // 添加新的资本结构层级（智能命名 + 滚动动画）
  const addEquityClass = () => {
    const newId = `equity-${Date.now()}`;
    const newClass = {
      id: newId,
      name: t('defaultName', { n: equityClasses.length + 1 }, lang),
      type: 'common',
      shares: 0,
      pricePerShare: 1.0,
      liquidationPreference: 0,
      participation: false,
      conversionRatio: 1.0,
      seniority: equityClasses.length
    };
    setEquityClasses([...equityClasses, newClass]);
    
    // 触发动画：标记新添加的层级 ID
    setAnimatingId(newId);
    
    // 滚动到新添加的层级位置
    setTimeout(() => {
      const element = document.getElementById(`equity-card-${newId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 添加高亮闪烁效果
        element.classList.add('ring-2', 'ring-apple-blue-500', 'ring-offset-2');
        setTimeout(() => {
          element.classList.remove('ring-2', 'ring-apple-blue-500', 'ring-offset-2');
        }, 2000);
      }
      setAnimatingId(null);
    }, 100);
  };


  // 删除资本结构层级
  const removeEquityClass = (id) => {
    if (equityClasses.length > 1) {
      setEquityClasses(equityClasses.filter(ec => ec.id !== id));
    } else {
      showNotification(t('needOneClass', {}, lang), 'error');
    }
  };

  // 更新资本结构层级（同时更新智能名称）
  const updateEquityClass = (id, updates) => {
    setEquityClasses(equityClasses.map(ec => {
      if (ec.id !== id) return ec;
      const updated = { ...ec, ...updates };
      // 当类型或关键参数变化时，自动更新智能名称
      if (updates.type || updates.pricePerShare || updates.exercisePrice || 
          updates.investmentAmount || updates.principal) {
        updated.name = generateSmartName(updated, lang);
      }
      return updated;
    }));
  };

  // 从 Excel 导入（支持全局参数）
  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const result = await importFromExcel(file);
      if (result.equityClasses) {
        setEquityClasses(result.equityClasses);
      }
      if (result.parameters) {
        setParameters(prev => ({
          ...prev,
          ...result.parameters
        }));
      }
      showNotification(t('importSuccess', { count: (result.equityClasses || []).length }, lang));
    } catch (error) {
      showNotification(error.message, 'error');
    }
    
    event.target.value = '';
  };

  // 导出到 Excel（跟随当前语言）
  const handleExport = () => {
    try {
      exportToExcel(valuationResult.results, parameters, equityClasses, 
        valuationResult.breakpointTable, lang);
      showNotification(t('exportSuccess', {}, lang));
    } catch (error) {
      showNotification(t('exportError', { msg: error.message }, lang), 'error');
    }
  };

  // 下载模板（跟随当前语言）
  const handleDownloadTemplate = () => {
    downloadTemplate(lang);
    showNotification(t('templateDownloaded', {}, lang));
  };

  // 切换语言
  const toggleLanguage = () => {
    const newLang = lang === 'zh' ? 'en' : 'zh';
    setLang(newLang);
    // 更新所有层级的智能名称
    setEquityClasses(prev => prev.map(ec => ({
      ...ec,
      name: generateSmartName(ec, newLang)
    })));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-apple-gray-50 via-white to-blue-50">
      {/* 顶部导航栏 - Apple 风格 */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-apple-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-apple-blue-500 to-apple-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Calculator className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-apple-gray-900">{t('appTitle', {}, lang)}</h1>
                <p className="text-sm text-apple-gray-500">{t('appSubtitle', {}, lang)}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* 语言切换 */}
              <button
                onClick={toggleLanguage}
                className="px-4 py-2 rounded-xl bg-apple-gray-100 hover:bg-apple-gray-200 text-apple-gray-700 transition-all duration-200 flex items-center space-x-2"
              >
                <Globe className="w-4 h-4" />
                <span className="text-sm font-medium">{t('langSwitch', {}, lang)}</span>
              </button>

              <button
                onClick={() => setShowParameters(!showParameters)}
                className="px-4 py-2 rounded-xl bg-apple-gray-100 hover:bg-apple-gray-200 text-apple-gray-700 transition-all duration-200 flex items-center space-x-2"
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm font-medium">{t('parameters', {}, lang)}</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 通知提示 */}
      {notification && (
        <div className={`fixed top-20 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-xl animate-slide-in ${
          notification.type === 'error' 
            ? 'bg-red-500/90 text-white' 
            : 'bg-green-500/90 text-white'
        }`}>
          <div className="flex items-center space-x-3">
            <Info className="w-5 h-5" />
            <span className="font-medium">{notification.message}</span>
          </div>
        </div>
      )}

      {/* 主内容区域 */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* 参数面板 */}
        {showParameters && (
          <ParametersPanel 
            parameters={parameters}
            setParameters={setParameters}
            onClose={() => setShowParameters(false)}
            lang={lang}
          />
        )}

        {/* 工具栏 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-apple-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={addEquityClass}
                className="px-5 py-2.5 rounded-xl bg-apple-blue-500 hover:bg-apple-blue-600 text-white transition-all duration-200 flex items-center space-x-2 shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span className="font-medium">{t('addClass', {}, lang)}</span>
              </button>
              
              <label className="px-5 py-2.5 rounded-xl bg-apple-gray-100 hover:bg-apple-gray-200 text-apple-gray-700 transition-all duration-200 flex items-center space-x-2 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span className="font-medium">{t('importExcel', {}, lang)}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
              
              <button
                onClick={handleDownloadTemplate}
                className="px-5 py-2.5 rounded-xl bg-apple-gray-100 hover:bg-apple-gray-200 text-apple-gray-700 transition-all duration-200 flex items-center space-x-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span className="font-medium">{t('downloadTemplate', {}, lang)}</span>
              </button>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* DLOM 开关 */}
              <button
                onClick={() => setIsDLOMEnabled(!isDLOMEnabled)}
                className={`px-4 py-2.5 rounded-xl transition-all duration-200 flex items-center space-x-2 ${
                  isDLOMEnabled 
                    ? 'bg-purple-500 hover:bg-purple-600 text-white shadow-md' 
                    : 'bg-apple-gray-100 hover:bg-apple-gray-200 text-apple-gray-700'
                }`}
              >
                <span className="text-sm font-medium">
                  {lang === 'en' ? 'DLOM' : 'DLOM 测算'}
                </span>
              </button>
            
              <button
                onClick={handleExport}
                disabled={valuationResult.results.length === 0}
                className="px-5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white transition-all duration-200 flex items-center space-x-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                <span className="font-medium">{t('exportResult', {}, lang)}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 资本结构输入区域 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-apple-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <TrendingUp className="w-6 h-6 text-apple-blue-500" />
            <h2 className="text-xl font-semibold text-apple-gray-900">{t('capStructure', {}, lang)}</h2>
          </div>
          
          <div className="space-y-4">
            {equityClasses.map((equityClass) => (
              <EquityClassInput
                key={equityClass.id}
                equityClass={equityClass}
                onUpdate={updateEquityClass}
                onRemove={removeEquityClass}
                canRemove={equityClasses.length > 1}
                lang={lang}
              />
            ))}
          </div>
        </div>

        {/* 估值结果显示（含断点分配表） */}
        {valuationResult.results.length > 0 && (
          <ResultsDisplay 
            results={valuationResult.results} 
            parameters={parameters} 
            breakpointTable={valuationResult.breakpointTable}
            totalAllocated={valuationResult.totalAllocated}
            lang={lang}
            isDLOMEnabled={isDLOMEnabled}
          />
        )}
        {/* 浮动添加按钮 - 固定在右下角 */}
        <button
          onClick={addEquityClass}
          className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-apple-blue-500 to-apple-blue-600 text-white shadow-2xl hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center group"
          title={t('addClass', {}, lang)}
        >
          <Plus className="w-7 h-7 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </main>

      {/* 页脚 */}

      <footer className="mt-16 py-8 border-t border-apple-gray-200 bg-white/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm text-apple-gray-500">{t('footer', {}, lang)}</p>
          <p className="text-xs text-apple-gray-400 mt-2">{t('footerPrivacy', {}, lang)}</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
