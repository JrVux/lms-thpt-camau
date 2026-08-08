import React from 'react';
import OmniLayout, { BadgeIcon } from '../components/OmniLayout';
import {
  BookOpen,
  X,
  ArrowRight,
  Zap,
  ShieldCheck,
  Globe,
  Layers,
  Code,
  ExternalLink
} from 'lucide-react';

const StepCard = ({ number, title, description, color, icon: Icon }) => (
  <div className="flex flex-col p-6 hover:bg-gray-50/80 rounded-2xl transition-all group cursor-pointer">
    <div className="flex items-center justify-between mb-4">
      <BadgeIcon icon={Icon} colorClass={color} size="lg" />
      <span className="text-[13px] font-bold text-brand-muted opacity-40 group-hover:opacity-100 transition-opacity">0{number}</span>
    </div>
    <h4 className="text-base font-bold text-brand-heading mb-2">
      {number}. {title}
    </h4>
    <p className="text-[14px] text-brand-muted leading-relaxed">
      {description}
    </p>
  </div>
);

const OmniDashboard = () => {
  return (
    <OmniLayout activeMenu="Trang chủ">
      <div className="space-y-8 animate-fade-in">
        {/* Promotional Banner */}
        <div className="relative overflow-hidden bg-gradient-to-r from-[#E8F0FE] to-[#F0EDFB] p-8 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6 z-10">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm">
              <Zap size={32} className="text-blue-500 fill-blue-500" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xl font-bold text-brand-heading">Nâng cấp lên OmniRoute Pro ngay hôm nay</h2>
              <p className="text-brand-body opacity-80 mt-1 max-w-md">
                Mở khóa các tính năng doanh nghiệp: không giới hạn API Keys, hạ tầng ưu tiên và hỗ trợ 24/7 từ chuyên gia.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 z-10">
            <button className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-200 flex items-center gap-2 group">
              Nâng cấp ngay <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="p-2.5 text-brand-muted hover:text-brand-heading transition-colors">
              <X size={20} />
            </button>
          </div>
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        </div>

        {/* Quick Start Section */}
        <div className="bg-white p-8 rounded-[2rem] shadow-card border border-brand-border">
          <div className="flex items-center justify-between mb-10">
            <div className="flex flex-col">
              <h2 className="text-xl font-bold text-brand-heading">Bắt đầu nhanh</h2>
              <p className="text-sm text-brand-muted mt-1">Hoàn thành các bước dưới đây để bắt đầu định tuyến gói tin đầu tiên.</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 border border-brand-border rounded-xl text-sm font-semibold text-brand-body hover:bg-gray-50 transition-all">
              <BookOpen size={16} />
              Tài liệu đầy đủ
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StepCard
              number={1}
              title="Tạo khóa API"
              description={<span>Truy cập mục <span className="text-brand font-medium">API Keys</span> để khởi tạo token bảo mật cho ứng dụng của bạn.</span>}
              color="red"
              icon={ShieldCheck}
            />
            <StepCard
              number={2}
              title="Cấu hình Endpoint"
              description={<span>Thiết lập đích đến cho dữ liệu bằng cách định nghĩa các <span className="text-brand font-medium">máy chủ</span> tiếp nhận.</span>}
              color="green"
              icon={Globe}
            />
            <StepCard
              number={3}
              title="Tích hợp SDK"
              description={<span>Sử dụng thư viện mã nguồn mở để <span className="text-brand font-medium">kết nối</span> ứng dụng với hệ thống.</span>}
              color="purple"
              icon={Code}
            />
            <StepCard
              number={4}
              title="Theo dõi dữ liệu"
              description={<span>Quan sát các <span className="text-brand font-medium">gói tin</span> đang được luân chuyển trong thời gian thực.</span>}
              color="orange"
              icon={Layers}
            />
          </div>
        </div>

        {/* Statistics or Recent Activity Placeholder */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-card border border-brand-border min-h-[300px] flex flex-col items-center justify-center text-center text-brand-muted">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <BarChart3 size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand-heading">Biểu đồ lưu lượng</h3>
              <p className="max-w-xs mx-auto mt-2 text-sm leading-relaxed">
                Chưa có dữ liệu thống kê. Hãy bắt đầu gửi các yêu cầu đầu tiên để xem báo cáo chi tiết.
              </p>
           </div>
           <div className="bg-white p-8 rounded-[2rem] shadow-card border border-brand-border">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-brand-heading">Hoạt động gần đây</h3>
                <button className="text-xs font-bold text-brand hover:underline">Tất cả</button>
              </div>
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-4 group cursor-pointer">
                    <div className="w-1.5 h-10 bg-gray-100 group-hover:bg-brand-light rounded-full transition-colors" />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-brand-muted uppercase tracking-wider">Hệ thống • 12:4{i} PM</span>
                      <span className="text-sm font-semibold mt-1 group-hover:text-brand transition-colors">Máy chủ Singapore đã kết nối thành công</span>
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-8 py-3 bg-gray-50 hover:bg-brand-light hover:text-brand text-brand-body text-sm font-bold rounded-xl transition-all border border-dashed border-brand-border flex items-center justify-center gap-2">
                Kiểm tra log chi tiết <ExternalLink size={14} />
              </button>
           </div>
        </div>
      </div>
    </OmniLayout>
  );
};

export default OmniDashboard;
