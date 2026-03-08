import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, FileJson, FileText, FileCode2, FileSpreadsheet, BookOpen, Briefcase, ShoppingCart, MessageCircle } from 'lucide-react';
import { content } from '../data/content';

const SupportedPlatforms = ({ lang }) => {
    const t = content[lang].supportedPlatforms;

    const getFormatStyle = (fmt) => {
        switch(fmt) {
            case 'Markdown': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'PDF': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
            case 'HTML': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
            case 'CSV': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'JSON': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            default: return 'bg-slate-800 text-slate-300 border-slate-700';
        }
    }

    const getFormatIcon = (fmt) => {
        switch(fmt) {
            case 'CSV': return <FileSpreadsheet size={12} />;
            case 'JSON': return <FileJson size={12} />;
            case 'Markdown': return <FileText size={12} />;
            case 'PDF': return <FileText size={12} />;
            case 'HTML': return <FileCode2 size={12} />;
            default: return <FileText size={12} />;
        }
    }

    return (
        <section id="supported" className="py-24 bg-slate-900/80 relative border-y border-slate-800 overflow-hidden">
            {/* Ambient Ambient Glows */}
            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="container mx-auto px-4 z-10 relative">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16 flex flex-col items-center"
                >
                    {/* Fixed '歪了' logic: inline-flex instead of inline-block flex */}
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold text-sm mb-5 shadow-inner backdrop-blur-sm">
                        <CheckCircle2 size={16} className="shrink-0" />
                        <span>{t.badge}</span>
                    </div>
                    <h2 className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-200 mb-5 tracking-tight">
                        {t.title}
                    </h2>
                    <p className="text-slate-400 max-w-2xl mx-auto text-lg leading-relaxed">
                        {t.subtitle}
                    </p>
                </motion.div>

                <div className="max-w-6xl mx-auto overflow-hidden rounded-[2rem] border border-slate-700/80 bg-slate-900/60 backdrop-blur-2xl shadow-2xl relative">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="bg-slate-950/60 text-slate-400 text-xs tracking-widest uppercase border-b border-slate-800/80">
                                    <th className="px-8 py-6 font-bold whitespace-nowrap hidden md:table-cell w-20"></th>
                                    <th className="px-6 py-6 font-bold whitespace-nowrap w-48">{t.tableHeaders.platform}</th>
                                    <th className="px-6 py-6 font-bold">{t.tableHeaders.page}</th>
                                    <th className="px-6 py-6 font-bold">{t.tableHeaders.content}</th>
                                    <th className="px-6 py-6 font-bold whitespace-nowrap">{t.tableHeaders.format}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {t.items.map((item, index) => {
                                    // Visual touches per platform row
                                    const iconMap = [
                                        <div className="text-blue-400 bg-blue-400/10 p-3 rounded-xl border border-blue-400/20 shadow-[0_0_15px_rgba(96,165,250,0.15)]"><BookOpen size={20} /></div>,
                                        <div className="text-teal-400 bg-teal-400/10 p-3 rounded-xl border border-teal-400/20 shadow-[0_0_15px_rgba(45,212,191,0.15)]"><Briefcase size={20} /></div>,
                                        <div className="text-red-400 bg-red-400/10 p-3 rounded-xl border border-red-400/20 shadow-[0_0_15px_rgba(248,113,113,0.15)]"><ShoppingCart size={20} /></div>,
                                        <div className="text-orange-400 bg-orange-400/10 p-3 rounded-xl border border-orange-400/20 shadow-[0_0_15px_rgba(251,146,60,0.15)]"><ShoppingCart size={20} /></div>,
                                        <div className="text-indigo-400 bg-indigo-400/10 p-3 rounded-xl border border-indigo-400/20 shadow-[0_0_15px_rgba(129,140,248,0.15)]"><MessageCircle size={20} /></div>,
                                        <div className="text-rose-400 bg-rose-400/10 p-3 rounded-xl border border-rose-400/20 shadow-[0_0_15px_rgba(251,113,133,0.15)]"><MessageCircle size={20} /></div>,
                                        <div className="text-sky-400 bg-sky-400/10 p-3 rounded-xl border border-sky-400/20 shadow-[0_0_15px_rgba(56,189,248,0.15)]"><MessageCircle size={20} /></div>,
                                    ];
                                    
                                    return (
                                        <motion.tr 
                                            key={index}
                                            initial={{ opacity: 0, y: 10 }}
                                            whileInView={{ opacity: 1, y: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: index * 0.05 }}
                                            className="hover:bg-slate-800/40 transition-colors duration-300 group"
                                        >
                                            <td className="px-8 py-6 hidden md:table-cell text-center relative">
                                                <div className="group-hover:scale-110 transition-transform duration-300 w-fit">
                                                    {iconMap[index]}
                                                </div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="font-bold text-white text-base md:text-lg tracking-wide group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-300 transition-all">{item.name}</div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="inline-block bg-slate-950/50 text-slate-300 text-[13px] font-mono tracking-tight px-3 py-2 rounded-lg border border-slate-800/80 group-hover:border-slate-700/80 transition-colors shadow-inner leading-relaxed">
                                                    {item.page}
                                                </div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="text-sm text-slate-400 leading-relaxed max-w-[300px] group-hover:text-slate-300 transition-colors">
                                                    {item.content}
                                                </div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="flex flex-wrap gap-2">
                                                    {item.formats.map((fmt, fIdx) => (
                                                        <span key={fIdx} className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm border ${getFormatStyle(fmt)} group-hover:shadow-md transition-shadow`}>
                                                            {getFormatIcon(fmt)}
                                                            {fmt}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default SupportedPlatforms;
