import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Code2, Download } from 'lucide-react';
import { content } from '../data/content';

const InstallGuide = ({ lang }) => {
    const t = content[lang].install;

    const methods = [
        {
            key: 'release',
            title: t.releaseTitle,
            steps: t.releaseSteps,
            cta: t.releaseCta,
            href: 'https://github.com/joshleeeeee/content-extract/releases',
            icon: <Download size={20} className="text-indigo-300" />,
            badgeClass: 'bg-indigo-500/15 border-indigo-400/30 text-indigo-200'
        },
        {
            key: 'source',
            title: t.devTitle,
            steps: t.devSteps,
            cta: t.devCta,
            href: 'https://github.com/joshleeeeee/content-extract/tree/main/extension',
            icon: <Code2 size={20} className="text-emerald-300" />,
            badgeClass: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
        }
    ];

    return (
        <section id="install" className="py-24 relative overflow-hidden">
            <div className="container mx-auto px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-14"
                >
                    <h2 className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-cyan-300 to-emerald-300 mb-4">
                        {t.title}
                    </h2>
                    <p className="text-slate-400 max-w-3xl mx-auto text-base md:text-lg">
                        {t.subtitle}
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {methods.map((method, index) => (
                        <motion.article
                            key={method.key}
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.12 }}
                            className="rounded-2xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-sm p-6 md:p-7"
                        >
                            <div className="flex items-center justify-between gap-4 mb-5">
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm ${method.badgeClass}`}>
                                    {method.icon}
                                    <span>{method.title}</span>
                                </div>
                                <a
                                    href={method.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-slate-300 hover:text-white transition-colors inline-flex items-center gap-1"
                                >
                                    <span>{method.cta}</span>
                                    <ArrowUpRight size={16} />
                                </a>
                            </div>

                            <ol className="space-y-4">
                                {method.steps.map((step, stepIndex) => (
                                    <li key={step} className="flex items-start gap-3">
                                        <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300">
                                            {stepIndex + 1}
                                        </span>
                                        <p className="text-slate-300 text-sm leading-relaxed">
                                            {step}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        </motion.article>
                    ))}
                </div>

                <motion.p
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 }}
                    className="mt-8 text-center text-sm text-slate-500"
                >
                    {t.note}
                </motion.p>
            </div>
        </section>
    );
};

export default InstallGuide;
