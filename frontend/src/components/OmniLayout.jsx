import React, { useState } from 'react';
import {
  Search,
  Home,
  Key,
  Server,
  Box,
  Link2,
  BarChart3,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
  BookOpen,
  X,
  ChevronLeft,
  Bell,
  Languages,
  RefreshCw
} from 'lucide-react';

const MenuItem = ({ icon: Icon, title, subtitle, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 p-2.5 rounded-lg transition-all relative group ${
        active
          ? 'bg-brand-light text-brand'
          : 'text-brand-heading hover:bg-gray-100'
      }`}
    >
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-brand rounded-r-full" />
      )}
      <div className={`mt-0.5 ${active ? 'text-brand' : 'text-brand-muted group-hover:text-brand-heading'}`}>
        <Icon size={18} />
      </div>
      <div className="flex flex-col items-start text-left">
        <span className={`text-[15px] font-semibold tracking-tight leading-tight ${active ? 'text-brand' : ''}`}>
          {title}
        </span>
        {subtitle && (
          <span className="text-[12.5px] text-brand-muted font-normal mt-0.5 leading-tight">
            {subtitle}
          </span>
        )}
      </div>
    </button>
  );
};

const BadgeIcon = ({ icon: Icon, colorClass, size = 'md' }) => {
  const sizes = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-11 h-11 rounded-xl'
  };

  const colors = {
    red: 'bg-badge-red-bg text-badge-red-text',
    green: 'bg-badge-green-bg text-badge-green-text',
    purple: 'bg-badge-purple-bg text-badge-purple-text',
    orange: 'bg-badge-orange-bg text-badge-orange-text',
    blue: 'bg-badge-blue-bg text-badge-blue-text',
  };

  return (
    <div className={`flex items-center justify-center ${sizes[size]} ${colors[colorClass]}`}>
      <Icon size={size === 'sm' ? 16 : size === 'md' ? 18 : 20} />
    </div>
  );
};

const OmniLayout = ({ children, pageTitle, pageDescription, activeMenu = 'Trang chủ' }) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const menuItems = [
    { icon: Home, title: 'Trang chủ', subtitle: 'Tổng quan hệ thống' },
    { icon: Key, title: 'API Keys', subtitle: 'Quản lý khóa truy cập' },
    { icon: Server, title: 'Máy chủ', subtitle: 'Cấu hình và trạng thái' },
    { icon: Box, title: 'Gói tin', subtitle: 'Dữ liệu đang luân chuyển' },
    { icon: Link2, title: 'Kết nối', subtitle: 'Webhooks & Tích hợp' },
    { icon: BarChart3, title: 'Thống kê', subtitle: 'Báo cáo chi tiết' },
  ];

  return (
    <div className="flex min-h-screen bg-page font-sans text-brand-heading">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full bg-white border-r border-brand-border z-30 transition-all duration-300 ${
          isSidebarCollapsed ? 'w-20' : 'w-[280px]'
        }`}
      >
        {/* Logo Section */}
        <div className="h-16 flex items-center px-5 gap-3 border-b border-brand-border">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center text-white">
            <RefreshCw size={20} className="animate-spin-slow" />
          </div>
          {!isSidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-none tracking-tight">OmniRoute</span>
              <span className="text-[10px] text-brand-muted font-medium tracking-widest uppercase">v2.4.0-stable</span>
            </div>
          )}
        </div>

        {/* Sidebar Content */}
        <div className="p-4 flex flex-col h-[calc(100%-64px)] justify-between">
          <div>
            {/* Search bar inside sidebar */}
            <div className={`relative mb-6 ${isSidebarCollapsed ? 'px-1' : ''}`}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" size={16} />
              {!isSidebarCollapsed ? (
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
              ) : (
                <div className="w-10 h-10 bg-gray-50 border border-brand-border rounded-lg" />
              )}
            </div>

            {/* Navigation */}
            <div className="space-y-6">
              <div>
                {!isSidebarCollapsed && (
                  <h3 className="px-3 mb-2 text-[11px] font-bold text-brand-muted uppercase tracking-[0.1em]">Menu chính</h3>
                )}
                <div className="space-y-1">
                  {menuItems.map((item) => (
                    <MenuItem
                      key={item.title}
                      icon={item.icon}
                      title={isSidebarCollapsed ? '' : item.title}
                      subtitle={isSidebarCollapsed ? '' : item.subtitle}
                      active={activeMenu === item.title}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className={`pt-4 border-t border-brand-border ${isSidebarCollapsed ? 'flex justify-center' : ''}`}>
             {!isSidebarCollapsed ? (
               <div className="bg-gray-50 p-3 rounded-xl flex items-center gap-3">
                 <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                 <span className="text-xs font-medium text-brand-body">Hệ thống đang ổn định</span>
               </div>
             ) : (
               <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
             )}
          </div>
        </div>

        {/* Collapse Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-white border border-brand-border rounded-full flex items-center justify-center text-brand-muted hover:text-brand transition-colors z-40"
        >
          <ChevronLeft size={14} className={`transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Main Content Area */}
      <main
        className={`flex-1 flex flex-col transition-all duration-300 ${
          isSidebarCollapsed ? 'pl-20' : 'pl-[280px]'
        }`}
      >
        {/* Header */}
        <header className="sticky top-0 h-20 bg-white/80 backdrop-blur-md border-b border-brand-border px-8 flex items-center justify-between z-20">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-brand-muted text-sm font-medium">Pages</span>
              <span className="text-brand-muted text-sm">/</span>
              <span className="text-brand-heading text-sm font-medium">{activeMenu}</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-brand-heading">{pageTitle || activeMenu}</h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Command Palette Mockup */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-brand-border rounded-lg cursor-pointer hover:border-brand/40 transition-colors group">
              <Search size={14} className="text-brand-muted group-hover:text-brand" />
              <span className="text-sm text-brand-muted pr-8">Điều hướng nhanh...</span>
              <kbd className="text-[10px] bg-white border border-brand-border px-1.5 py-0.5 rounded font-sans font-medium text-brand-muted">Ctrl+K</kbd>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1 border-l border-brand-border pl-4">
              <button className="p-2 text-brand-muted hover:text-brand hover:bg-brand-light rounded-lg transition-all">
                <Languages size={18} />
              </button>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 text-brand-muted hover:text-brand hover:bg-brand-light rounded-lg transition-all"
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button className="p-2 text-brand-muted hover:text-brand hover:bg-brand-light rounded-lg transition-all relative">
                <Bell size={18} />
                <span className="absolute top-2 right-2 w-2 h-2 bg-brand rounded-full border-2 border-white" />
              </button>
              <button className="p-2 ml-2 text-brand-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-8 max-w-[1600px]">
          {children}
        </div>
      </main>
    </div>
  );
};

export { BadgeIcon };
export default OmniLayout;
