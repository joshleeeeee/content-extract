
import React, { useState } from 'react';
import Header from './Header';
import Hero from './Hero';
import Features from './Features';
import Showcase from './Showcase';
import Footer from './Footer';

const App = () => {
    const [lang, setLang] = useState('zh');

    // Toggle language function
    const toggleLang = () => {
        setLang(lang === 'en' ? 'zh' : 'en');
    };

    return (
        <React.Fragment>
            <Header lang={lang} toggleLang={toggleLang} />
            <main>
                <Hero lang={lang} />
                <Features lang={lang} />
                <Showcase lang={lang} />
            </main>
            <Footer lang={lang} />
        </React.Fragment>
    );
};

export default App;
