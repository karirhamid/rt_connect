import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Save, Check } from 'lucide-react';

function GeneralSettings() {
  const { t, i18n } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'fr');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Apply RTL for Arabic
    if (selectedLanguage === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
      // Add Arabic font class
      document.documentElement.classList.add('font-arabic');
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = selectedLanguage;
      document.documentElement.classList.remove('font-arabic');
    }
  }, [selectedLanguage]);

  const languages = [
    { code: 'fr', name: t('french'), nativeName: 'Français', flag: '🇫🇷' },
    { code: 'en', name: t('english'), nativeName: 'English', flag: '🇬🇧' },
    { code: 'ar', name: t('arabic'), nativeName: 'العربية', flag: '🇸🇦' }
  ];

  const handleLanguageChange = (langCode) => {
    setSelectedLanguage(langCode);
    i18n.changeLanguage(langCode);
    localStorage.setItem('language', langCode);
    setSaved(false);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Globe className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('generalSettings')}</h1>
              <p className="text-sm text-gray-500 mt-1">{t('languageDescription')}</p>
            </div>
          </div>
        </div>

        {/* Language Settings Section */}
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('languageSettings')}</h2>
            <p className="text-sm text-gray-600 mb-4">{t('selectLanguage')}</p>
          </div>

          {/* Language Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`relative p-6 rounded-lg border-2 transition-all duration-200 ${
                  selectedLanguage === lang.code
                    ? 'border-primary-500 bg-primary-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                {selectedLanguage === lang.code && (
                  <div className="absolute top-3 right-3">
                    <div className="bg-primary-500 rounded-full p-1">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}
                
                <div className="text-center">
                  <div className="text-4xl mb-3">{lang.flag}</div>
                  <h3 className="font-semibold text-gray-900 mb-1">{lang.nativeName}</h3>
                  <p className="text-sm text-gray-500">{lang.name}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Current Language Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">{t('systemLanguage')}</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {languages.find(l => l.code === selectedLanguage)?.nativeName}
                </p>
              </div>
              <div className="text-4xl">
                {languages.find(l => l.code === selectedLanguage)?.flag}
              </div>
            </div>
          </div>

          {/* RTL Info for Arabic */}
          {selectedLanguage === 'ar' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="text-blue-600 mt-0.5">ℹ️</div>
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">تم تفعيل التصميم من اليمين لليسار</p>
                  <p>تم تطبيق خط Noto Kufi Arabic وتخطيط RTL تلقائياً للغة العربية.</p>
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              <Save className="w-5 h-5" />
              {t('saveChanges')}
            </button>

            {saved && (
              <div className="flex items-center gap-2 text-green-600 animate-fade-in">
                <Check className="w-5 h-5" />
                <span className="font-medium">{t('settingsSaved')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Additional Settings Placeholder */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <p className="text-sm text-gray-500 text-center">
            {selectedLanguage === 'ar' 
              ? 'إعدادات إضافية ستكون متاحة قريباً'
              : selectedLanguage === 'en'
              ? 'Additional settings will be available soon'
              : 'Des paramètres supplémentaires seront bientôt disponibles'
            }
          </p>
        </div>
      </div>
    </div>
  );
}

export default GeneralSettings;
