import React from 'react';
import { Github, Mail, Coffee } from 'lucide-react';
import { content } from '../data/content';

const Footer = ({ lang }) => {
    const t = content[lang].footer;
    return (
        <footer className="bg-slate-900 border-t border-slate-800 py-12 text-slate-400">
            <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">

                {/* Brand */}
                <div>
                    <h4 className="text-white font-bold text-lg mb-2">OnlineDocExporter</h4>
                    <p className="text-sm max-w-xs">
                        {t.brandDescription}
                    </p>
                </div>

                {/* Links */}
                <div className="flex gap-8 text-sm items-center">
                    <a href="#" className="hover:text-white transition-colors">{t.privacy}</a>
                    <a href="#" className="hover:text-white transition-colors">{t.terms}</a>
                    <a href="https://github.com/joshleeeeee/online-doc-exporter#sponsor" target="_blank" className="hover:text-amber-400 transition-colors flex items-center gap-1 text-amber-500/80">
                        <Coffee size={14} />
                        {t.sponsor}
                    </a>
                    <a href="https://github.com/joshleeeeee/online-doc-exporter" className="hover:text-white transition-colors">GitHub</a>
                </div>

                {/* Socials */}
                <div className="flex gap-4">
                    <a href="https://github.com/joshleeeeee/online-doc-exporter" className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 hover:text-white transition-all">
                        <Github size={20} />
                    </a>
                    <a href="mailto:joshlindx@outlook.com" className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 hover:text-white transition-all">
                        <Mail size={20} />
                    </a>
                    <a href="https://github.com/joshleeeeee/online-doc-exporter#sponsor" target="_blank" className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 hover:text-amber-400 transition-all text-slate-400" title={t.sponsor}>
                        <Coffee size={20} />
                    </a>
                </div>
            </div>

            <div className="container mx-auto px-4 mt-12 pt-8 border-t border-slate-800">
                <div className="max-w-4xl mx-auto text-center space-y-2">
                    <h5 className="text-slate-300 font-semibold text-sm">{t.disclaimer.title}</h5>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        {t.disclaimer.text}
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-4 mt-8 pt-8 border-t border-slate-800 text-center text-xs text-slate-500">
                &copy; {new Date().getFullYear()} {t.rights}
            </div>
        </footer>
    );
};

export default Footer;
