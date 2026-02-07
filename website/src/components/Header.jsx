
import React, { useState } from 'react';
import { Github, Globe, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { content } from '../data/content';

const Header = ({ lang, toggleLang }) => {
    const [isOpen, setIsOpen] = useState(false);
    const t = content[lang].header;

    const links = [
        { name: t.features, href: '#features' },
        { name: t.showcase, href: '#showcase' },
        { name: t.faq, href: '#faq' },
    ];

    return (
        <header className="fixed top-0 left-0 right-0 z-50 py-4 px-6 md:px-12 backdrop-blur-md bg-slate-900/50 border-b border-slate-800">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-2"
                >
                    <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center transform rotate-3">
                        <span className="text-white font-bold text-lg">O</span>
                    </div>
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
                        {t.brand}
                    </span>
                </motion.div>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-center gap-8">
                    {links.map((link, i) => (
                        <motion.a
                            key={link.name}
                            href={link.href}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="text-slate-300 hover:text-white transition-colors text-sm font-medium hover:underline decoration-indigo-500 underline-offset-4"
                        >
                            {link.name}
                        </motion.a>
                    ))}

                    {/* Language Switcher */}
                    <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={toggleLang}
                        className="flex items-center gap-2 text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <Globe size={18} />
                        <span className="text-sm font-medium uppercase">{lang}</span>
                    </motion.button>

                    <motion.a
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        href="https://github.com/joshleeeeee/online-doc-exporter"
                        className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-full border border-slate-700 transition-all shadow-lg hover:shadow-indigo-500/20"
                    >
                        <Github size={18} />
                        <span>{t.star}</span>
                    </motion.a>
                </div>

                {/* Mobile Menu Toggle */}
                <div className="flex items-center gap-4 md:hidden">
                    <button
                        onClick={toggleLang}
                        className="text-slate-300 hover:text-white p-2"
                    >
                        <div className="flex items-center gap-1 font-bold text-sm">
                            <Globe size={18} />
                            {lang.toUpperCase()}
                        </div>
                    </button>
                    <button
                        className="text-slate-300"
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        {isOpen ? <X /> : <Menu />}
                    </button>
                </div>
            </div>

            {/* Mobile Nav */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden bg-slate-900 border-t border-slate-800 mt-4 overflow-hidden"
                    >
                        <div className="p-4 flex flex-col gap-4">
                            {links.map((link) => (
                                <a
                                    key={link.name}
                                    href={link.href}
                                    className="text-slate-300 block py-2 hover:text-white transition-colors"
                                    onClick={() => setIsOpen(false)}
                                >
                                    {link.name}
                                </a>
                            ))}
                            <a
                                href="https://github.com/joshleeeeee/online-doc-exporter"
                                className="flex items-center gap-2 text-indigo-400 py-2 font-medium hover:text-indigo-300 transition-colors"
                            >
                                <Github size={18} />
                                <span>{t.repo}</span>
                            </a>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
};

export default Header;
