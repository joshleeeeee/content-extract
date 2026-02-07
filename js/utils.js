class ImageUtils {
    /**
     * Convert an image URL to a Base64 string.
     * @param {string} url - The URL of the image.
     * @returns {Promise<string>} - The Base64 string.
     */
    static async urlToBase64(url) {
        try {
            const response = await fetch(url, { referrerPolicy: 'no-referrer' });
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.warn('Base64 conversion failed for:', url, e);
            return url; // Fallback to URL
        }
    }
}

class DomUtils {
    /**
     * Wait for an element to appear in the DOM.
     * @param {string} selector - CSS selector.
     * @returns {Promise<Element>}
     */
    static waitForElement(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    resolve(document.querySelector(selector));
                    observer.disconnect();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    /**
     * Create an element with optional attributes and children.
     * @param {string} tag
     * @param {Object} attributes
     * @param {Array<Node|string>} children
     * @returns {HTMLElement}
     */
    static createElement(tag, attributes = {}, children = []) {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(attributes)) {
            if (key === 'style' && typeof value === 'object') {
                Object.assign(el.style, value);
            } else if (key === 'className') {
                el.className = value;
            } else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.substring(2).toLowerCase(), value);
            } else {
                el.setAttribute(key, value);
            }
        }
        children.forEach(child => {
            if (typeof child === 'string') {
                el.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                el.appendChild(child);
            }
        });
        return el;
    }
}
