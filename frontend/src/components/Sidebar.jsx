import { Link } from 'react-router-dom';
import { ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * pgAdmin 4-inspired tree-view sidebar (white background).
 *
 * Features:
 *  - White background with branded header
 *  - Expand / collapse tree nodes with chevron arrows
 *  - Tree guide lines (vertical + horizontal branches)
 *  - Compact items with small icons
 *  - Collapsed mode with hover flyout popups
 */
export default function Sidebar({
  sections,
  sidebarOpen,
  setSidebarOpen,
  sidebarCollapsed,
  openSections,
  toggleSection,
  isActive,
  isRTL,
}) {
  const { t } = useTranslation();
  const [branding, setBranding] = useState({ app_name: 'RTPointage', client_name: null });

  useEffect(() => {
    let cancelled = false;
    api.getPublicBranding().then(b => { if (!cancelled) setBranding(b); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);


  /* ───────── Collapsed: icon per section + hover flyout ───────── */
  const renderCollapsedSection = (section) => {
    if (!section) return null;
    const SectionIcon = section.icon;
    // Filter out divider items for hover-flyout + active checks
    const linkItems = section.items.filter(i => i.type !== 'divider');
    const hasActive = linkItems.some((i) => isActive(i.href));

    if (linkItems.length === 1) {
      return (
        <Link
          to={linkItems[0].href}
          onClick={() => setSidebarOpen(false)}
          className={`flex items-center justify-center p-2 rounded-lg transition-colors ${
            hasActive
              ? 'bg-primary-50 text-primary-700'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <SectionIcon className="w-5 h-5" />
        </Link>
      );
    }

    return (
      <div className="relative group">
        <div
          className={`flex items-center justify-center p-2 rounded-lg cursor-pointer transition-colors ${
            hasActive
              ? 'bg-primary-50 text-primary-700'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <SectionIcon className="w-5 h-5" />
        </div>
        <div
          className={`absolute ${
            isRTL ? 'right-full' : 'left-full'
          } top-0 hidden group-hover:block z-[60]`}
        >
          <div
            className={`${
              isRTL ? 'mr-2' : 'ml-2'
            } bg-white shadow-lg rounded-lg py-1.5 min-w-[190px] border border-gray-100`}
          >
            <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">
              {section.title}
            </div>
            {section.items.map((item, idx) => {
              if (item.type === 'divider') {
                return (
                  <div key={`div-${idx}`}
                       className="mx-3 mt-2 mb-1 pt-2 border-t border-gray-100 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                    {item.label}
                  </div>
                );
              }
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  /* ───────── Render ───────── */
  return (
    <div
      className={`fixed inset-y-0 z-50 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      } bg-white shadow-lg transform transition-all duration-300 ease-in-out ${
        isRTL
          ? `right-0 lg:translate-x-0 ${
              sidebarOpen ? 'translate-x-0' : 'translate-x-full'
            }`
          : `left-0 lg:translate-x-0 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`
      }`}
    >
      <div className="flex flex-col h-full">
        {/* ─── Header ─── */}
        <div
          className={`${
            sidebarCollapsed ? 'px-3 justify-center' : 'px-4'
          } h-16 border-b border-gray-200 flex items-center shrink-0`}
        >
          <div className="flex items-center w-full min-w-0">
            {sidebarCollapsed ? (
              /* Collapsed: large bold "RT" letters, centered */
              <h1
                className="w-full text-center text-2xl font-extrabold text-slate-900 tracking-tight select-none leading-none"
                style={{ letterSpacing: '-0.05em' }}
              >
                RT
              </h1>
            ) : (
              /* Expanded: full RTPointage wordmark + client name */
              <div className="min-w-0 w-full">
                <h1
                  className="text-2xl font-extrabold text-slate-900 tracking-tight truncate leading-none"
                  style={{ letterSpacing: '-0.03em' }}
                >
                  <span>RT</span>
                  <span className="text-slate-500 font-light">Pointage</span>
                </h1>
                {branding.client_name && (
                  <p className="mt-1 text-[10px] text-gray-400 uppercase tracking-widest truncate">
                    {branding.client_name}
                  </p>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-gray-600 ml-auto"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── Navigation tree ─── */}
        <nav className={`flex-1 ${sidebarCollapsed ? 'overflow-visible' : 'overflow-y-auto'} py-3 px-2`}>
          {sidebarCollapsed ? (
            /* Collapsed icon list */
            <div className="space-y-1">
              {sections.map((section) => (
                <div key={section.key}>
                  {renderCollapsedSection(section)}
                </div>
              ))}
            </div>
          ) : (
            /* Expanded tree view */
            <div className="space-y-0.5">
              {sections.map((section) => {
                const SectionIcon = section.icon;
                const linkItems = section.items.filter(i => i.type !== 'divider');
                const hasActive = linkItems.some((i) => isActive(i.href));
                const isOpen = openSections[section.key];

                /* ---- Single-item section → direct link (e.g. Dashboard) ---- */
                if (linkItems.length === 1) {
                  const item = linkItems[0];
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={section.key}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                        active
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                }

                /* ---- Multi-item section → tree node ---- */
                return (
                  <div
                    key={section.key}
                    className="mb-0.5"
                  >
                    {/* Section header (expand / collapse) */}
                    <button
                      onClick={() => toggleSection(section.key)}
                      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                        hasActive && !isOpen
                          ? 'text-primary-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <ChevronRight
                        className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 text-gray-400 ${
                          isOpen ? 'rotate-90' : ''
                        }`}
                      />
                      <SectionIcon className="w-[18px] h-[18px] shrink-0" />
                      <span className="truncate">{section.title}</span>
                      {/* Active indicator dot when section is collapsed */}
                      {!isOpen && hasActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
                      )}
                    </button>

                    {/* Children with tree guide lines */}
                    {isOpen && (
                      <div
                        className={`mt-0.5 relative ${
                          isRTL
                            ? 'mr-[18px] border-r border-gray-200'
                            : 'ml-[18px] border-l border-gray-200'
                        }`}
                      >
                        {section.items.map((item, idx) => {
                          // Sub-group label inside a section (visual divider)
                          if (item.type === 'divider') {
                            return (
                              <div
                                key={`div-${idx}`}
                                className={`${idx === 0 ? 'mt-0' : 'mt-2'} mb-1 ${isRTL ? 'pr-5' : 'pl-5'}
                                            text-[10px] font-semibold uppercase tracking-wider text-gray-400 select-none`}
                              >
                                {item.label}
                              </div>
                            );
                          }
                          const Icon = item.icon;
                          const active = isActive(item.href);
                          return (
                            <div key={item.name} className="relative">
                              {/* Horizontal branch connector */}
                              <div
                                className={`absolute top-1/2 w-3 border-t border-gray-200 ${
                                  isRTL ? 'right-0' : 'left-0'
                                }`}
                                style={{ transform: 'translateY(-50%)' }}
                              />
                              <Link
                                to={item.href}
                                onClick={() => setSidebarOpen(false)}
                                className={`flex items-center gap-2.5 ${
                                  isRTL ? 'pr-5' : 'pl-5'
                                } py-[5px] rounded-md text-[13px] whitespace-nowrap transition-all duration-150 ${
                                  active
                                    ? 'bg-primary-50 text-primary-700 font-medium'
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                }`}
                              >
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="truncate">{item.name}</span>
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </nav>

      </div>
    </div>
  );
}
