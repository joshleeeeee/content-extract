
// Helper to extract styled text from an element
function extractStyledText(element, format = 'markdown') {
    let result = '';

    const textSpans = element.querySelectorAll('.ace-line [data-string="true"]');

    if (textSpans.length === 0) {
        return '';
    }

    textSpans.forEach(span => {
        let text = span.textContent;
        // Basic style checks for Markdown
        const style = span.getAttribute('style') || '';
        const classes = span.className || '';

        // Markdown heuristics (keep existing logic or simplified)
        // We use computed style for HTML to be accurate, but for MD we stick to structure.
        const isCode = classes.includes('code-inline') || style.includes('font-family:Monospace');

        if (format === 'markdown') {
            const isBold = style.includes('font-weight:bold') || style.includes('font-weight: bold') || classes.includes('replace-bold');
            const isItalic = style.includes('font-style:italic') || style.includes('font-style: italic');
            const isStrike = style.includes('text-decoration:line-through') || style.includes('text-decoration: line-through');

            let chunk = text;
            if (isCode) chunk = '`' + chunk + '`';
            if (isBold) chunk = '**' + chunk + '**';
            if (isItalic) chunk = '*' + chunk + '*';
            if (isStrike) chunk = '~~' + chunk + '~~';

            const linkWrapper = span.closest('a.link');
            if (linkWrapper && linkWrapper.href) {
                chunk = `[${chunk}](${linkWrapper.href})`;
            }
            result += chunk;

        } else {
            // HTML: Use getComputedStyle for accurate visual replication
            // This captures class-based colors (textHighlight etc) automatically.
            const computed = window.getComputedStyle(span);

            // Extract relevant styles
            const color = computed.color;
            const bg = computed.backgroundColor;
            const fontWeight = parseInt(computed.fontWeight);
            const isComputedBold = fontWeight >= 600 || computed.fontWeight === 'bold';
            const isComputedItalic = computed.fontStyle === 'italic';
            const decoration = computed.textDecorationLine || computed.textDecoration || '';
            const isUnderline = decoration.includes('underline');
            const isStrike = decoration.includes('line-through');

            let chunk = text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            // Build inline style string
            let stylesComponents = [];

            // Colors
            if (color && color !== 'rgba(0, 0, 0, 0)') {
                stylesComponents.push(`color: ${color}`);
            }
            if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                stylesComponents.push(`background-color: ${bg}`);
            }

            // Fonts
            if (isComputedBold) stylesComponents.push('font-weight: bold');
            if (isComputedItalic) stylesComponents.push('font-style: italic');

            // Decoration
            let decors = [];
            if (isUnderline) decors.push('underline');
            if (isStrike) decors.push('line-through');
            if (decors.length > 0) stylesComponents.push(`text-decoration: ${decors.join(' ')}`);

            // Code font override?
            if (isCode) {
                stylesComponents.push('font-family: monospace');
                stylesComponents.push('background-color: rgba(0,0,0,0.05)'); // Light gray for code if not set
                stylesComponents.push('border-radius: 3px');
                stylesComponents.push('padding: 0 3px');
            }

            // Wrap in span with style
            if (stylesComponents.length > 0) {
                chunk = `<span style="${stylesComponents.join('; ')}">${chunk}</span>`;
            }

            // Links
            const linkWrapper = span.closest('a.link');
            if (linkWrapper && linkWrapper.href) {
                chunk = `<a href="${linkWrapper.href}">${chunk}</a>`; // Tag nesting: a > span
            }

            result += chunk;
        }
    });

    return result;
}

// Helper to convert image URL to Base64
async function imageToBase64(url) {
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

async function getBlockContent(block, format, options = {}) {
    const type = block.getAttribute('data-block-type');
    const textContent = extractStyledText(block, format);

    if (format === 'markdown') {
        switch (type) {
            case 'heading1': return `# ${textContent}\n\n`;
            case 'heading2': return `## ${textContent}\n\n`;
            case 'heading3': return `### ${textContent}\n\n`;
            case 'heading4': return `#### ${textContent}\n\n`;
            case 'heading5': return `##### ${textContent}\n\n`;
            case 'heading6': return `###### ${textContent}\n\n`;
            case 'heading7': return `####### ${textContent}\n\n`;
            case 'heading8': return `######## ${textContent}\n\n`;
            case 'heading9': return `######### ${textContent}\n\n`;
            case 'text': return `${textContent}\n\n`;
            case 'code': return "```\n" + block.textContent + "\n```\n\n"; // Simplified code block
            case 'quote': return `> ${textContent}\n\n`;
            case 'ordered': return `1. ${textContent}\n`; // We handle list grouping later or just let it be
            case 'bullet': return `- ${textContent}\n`;
            case 'todo':
                const isChecked = block.querySelector('.todo-checkbox.checked'); // Heuristic
                return `- [${isChecked ? 'x' : ' '}] ${textContent}\n`;
            case 'divider': return `---\n\n`;
            case 'image':
                const img = block.querySelector('img');
                if (img) {
                    const src = img.getAttribute('data-src') || img.src;
                    if (src && !src.startsWith('data:image/svg')) {
                        let finalSrc = src;
                        if (options.useBase64 && !src.startsWith('data:')) {
                            finalSrc = await imageToBase64(src);
                        }
                        // Use HTML img tag even in Markdown to bypass referrer checks if possible
                        return `<img src="${finalSrc}" referrerpolicy="no-referrer" alt="Image" />\n\n`;
                    }
                }
                return '';
            default: return textContent + '\n\n';
        }
    } else {
        // HTML
        switch (type) {
            case 'heading1': return `<h1>${textContent}</h1>`;
            case 'heading2': return `<h2>${textContent}</h2>`;
            case 'heading3': return `<h3>${textContent}</h3>`;
            case 'text': return `<p>${textContent}</p>`;
            case 'code': return `<pre><code>${block.textContent}</code></pre>`;
            case 'quote': return `<blockquote>${textContent}</blockquote>`;
            case 'ordered': return `<li>${textContent}</li>`; // Needs parent <ol> wrapper logic
            case 'bullet': return `<li>${textContent}</li>`; // Needs parent <ul> wrapper logic
            case 'todo': return `<div><input type="checkbox" ${block.querySelector('.checked') ? 'checked' : ''}> ${textContent}</div>`;
            case 'divider': return `<hr/>`;
            case 'image':
                const img = block.querySelector('img');
                if (img) {
                    const src = img.getAttribute('data-src') || img.src;
                    if (src) {
                        let finalSrc = src;
                        if (options.useBase64 && !src.startsWith('data:')) {
                            finalSrc = await imageToBase64(src);
                        }
                        return `<img src="${finalSrc}" referrerpolicy="no-referrer" />`;
                    }
                }
                return '';
            default: return `<p>${textContent}</p>`;
        }
    }
}

// Table Processor that handles multiple table blocks as one
// Table Processor that handles multiple table blocks as one
async function processTables(tableBlocks, format, options = {}) {
    let tableOut = '';
    let allRows = [];

    // Collect rows from all blocks
    tableBlocks.forEach(block => {
        const rows = Array.from(block.querySelectorAll('tr'));
        allRows = allRows.concat(rows);
    });

    if (allRows.length === 0) return '';

    // Check if table has complex content (images)
    const hasImages = allRows.some(row => row.querySelector('img'));

    // Force HTML table for Markdown if it contains images
    if (format === 'markdown' && hasImages) {
        format = 'html_table_in_md';
    }

    if (format === 'markdown') {
        tableOut += '\n|';
        for (let rowIndex = 0; rowIndex < allRows.length; rowIndex++) {
            const row = allRows[rowIndex];
            const cells = row.querySelectorAll('td');
            let rowStr = '|';

            for (const cell of cells) {
                let cellContent = '';
                // Robust Image Extraction: Direct query for all images in cell
                let images = Array.from(cell.querySelectorAll('img'));

                // Filter images
                images = images.filter(img => {
                    const src = img.getAttribute('data-src') || img.src;
                    if (src && src.startsWith('data:image/svg')) return false;
                    if (img.width < 10 && img.height < 10) return false; // Skip tiny icons
                    return true;
                });

                for (const img of images) {
                    const src = img.getAttribute('data-src') || img.src;
                    if (src) {
                        let finalSrc = src;
                        if (options.useBase64 && !src.startsWith('data:')) {
                            finalSrc = await imageToBase64(src);
                        }
                        cellContent += `<img src="${finalSrc}" referrerpolicy="no-referrer" style="max-width:100%;" /><br>`;
                    }
                }

                // Text Extraction
                const text = extractStyledText(cell, 'markdown');
                if (text.trim()) {
                    cellContent += text.replace(/\n/g, '<br>');
                }

                // Cleanup
                if (cellContent.endsWith('<br>')) cellContent = cellContent.slice(0, -4);
                rowStr += ` ${cellContent} |`;
            }
            tableOut += rowStr + '\n';

            // Header Separator
            if (rowIndex === 0) {
                let sep = '|';
                cells.forEach(() => sep += ' --- |');
                tableOut += sep + '\n';
            }
        }
        tableOut += '\n';

    } else {
        // HTML Output
        const isFallback = format === 'html_table_in_md';

        tableOut += '<table border="1" style="border-collapse: collapse; width: 100%;">';
        for (const row of allRows) {
            tableOut += '<tr>';
            const cells = row.querySelectorAll('td');

            for (const cell of cells) {
                let cellInner = '';
                const blocks = cell.querySelectorAll('[data-block-type]');

                if (blocks.length > 0) {
                    for (const ib of blocks) {
                        cellInner += await getBlockContent(ib, 'html', options);
                    }
                } else {
                    // Fallback
                    cellInner = extractStyledText(cell, 'html');
                    // Extra check for images not in blocks
                    const images = cell.querySelectorAll('img');
                    for (const img of images) {
                        if (!cellInner.includes(img.src) && img.width > 20) {
                            let finalSrc = img.src;
                            if (options.useBase64 && !finalSrc.startsWith('data:')) {
                                finalSrc = await imageToBase64(finalSrc);
                            }
                            cellInner += `<img src="${finalSrc}" referrerpolicy="no-referrer" style="max-width:100%;" /><br>`;
                        }
                    }
                }
                tableOut += `<td style="border: 1px solid #ccc; padding: 5px;">${cellInner}</td>`;
            }
            tableOut += '</tr>';
        }
        tableOut += '</table>';
        if (isFallback) tableOut += '\n\n';
    }
    return tableOut;
}

// Main Extraction Logic
// Main Extraction Logic
async function extractContent(format, options = {}) {
    const roots = document.querySelectorAll('.docx-page-block');
    if (roots.length === 0 && document.querySelectorAll('[data-block-type]').length === 0) {
        console.warn('No content blocks found');
    }

    let output = '';
    let listState = null;
    let tableBuffer = [];

    // Use a slightly broader selector to ensure we catch top level blocks
    const allBlocks = Array.from(document.querySelectorAll('[data-block-type]'));

    // Helper to flush table buffer
    const flushTableBuffer = async () => {
        if (tableBuffer.length > 0) {
            output += await processTables(tableBuffer, format, options);
            tableBuffer = [];
        }
    };

    for (let i = 0; i < allBlocks.length; i++) {
        const block = allBlocks[i];
        const type = block.getAttribute('data-block-type');

        // Skip hidden/container types
        if (type === 'page' || type === 'table_cell') continue;

        // If inside a table, skip (unless it IS the table block itself)
        // Feishu nested structure: table > tr > td > blocks.
        // We want to skip the inner blocks because processTable handles them.
        if (block.closest('[data-block-type="table"]') && type !== 'table') {
            continue;
        }

        if (type === 'table') {
            tableBuffer.push(block);
            continue;
        } else {
            // Non-table block: flush buffer first
            await flushTableBuffer();
        }

        // List Handling (HTML)
        if (format === 'html') {
            if (type === 'ordered') {
                if (listState !== 'ol') {
                    if (listState === 'ul') output += '</ul>';
                    output += '<ol>';
                    listState = 'ol';
                }
            } else if (type === 'bullet') {
                if (listState !== 'ul') {
                    if (listState === 'ol') output += '</ol>';
                    output += '<ul>';
                    listState = 'ul';
                }
            } else {
                if (listState === 'ol') { output += '</ol>'; listState = null; }
                if (listState === 'ul') { output += '</ul>'; listState = null; }
            }
        }

        output += await getBlockContent(block, format, options);
    }

    await flushTableBuffer(); // Final flush

    if (format === 'html' && listState) {
        output += listState === 'ol' ? '</ol>' : '</ul>';
    }

    return output;
}

// UI Injection
function init() {
    console.log('Feishu Copy Extension Loaded');

    // Create container
    const container = document.createElement('div');
    container.id = 'feishu-copy-extension-container';

    // Header/Title (Optional, can add later if needed)
    // const title = document.createElement('h4');
    // title.innerText = 'Feishu Copy';
    // title.style.margin = '0 0 8px 0';
    // container.appendChild(title);

    // Toggle Switch (Images to Base64)
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'feishu-copy-toggle';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'feishu-copy-base64';

    const slider = document.createElement('span');
    slider.className = 'feishu-copy-toggle-slider';

    toggleLabel.appendChild(document.createTextNode('Base64 Images'));
    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(slider); // The slider visual

    container.appendChild(toggleLabel);

    // Buttons Container
    const btnContainer = document.createElement('div');
    btnContainer.className = 'feishu-copy-btn-container';

    // Copy Markdown Button (Primary)
    const btnMarkdown = document.createElement('button');
    btnMarkdown.innerText = 'Copy Markdown';
    btnMarkdown.className = 'feishu-copy-btn';
    btnMarkdown.onclick = async () => {
        const useBase64 = checkbox.checked;
        const btnText = btnMarkdown.innerText;
        btnMarkdown.innerText = 'Copying...';
        btnMarkdown.style.opacity = '0.7';

        try {
            const md = await extractContent('markdown', { useBase64 });
            await navigator.clipboard.writeText(md);
            showToast('Markdown Copied!');
        } catch (e) {
            console.error(e);
            showToast('Error: ' + e.message); // Use toast for error too
        } finally {
            btnMarkdown.innerText = btnText;
            btnMarkdown.style.opacity = '1';
        }
    };

    // Copy RichText Button (Secondary)
    const btnRich = document.createElement('button');
    btnRich.innerText = 'Copy RichText';
    btnRich.className = 'feishu-copy-btn secondary';
    btnRich.onclick = async () => {
        const useBase64 = checkbox.checked;
        const btnText = btnRich.innerText;
        btnRich.innerText = 'Copying...';
        btnRich.style.opacity = '0.7';

        try {
            const html = await extractContent('html', { useBase64 });
            const blob = new Blob([html], { type: 'text/html' });

            // For text/plain fallback
            const md = await extractContent('markdown', { useBase64 });
            const textBlob = new Blob([md], { type: 'text/plain' });

            const data = [new ClipboardItem({
                'text/html': blob,
                'text/plain': textBlob
            })];

            await navigator.clipboard.write(data);
            showToast('Rich Text Copied!');
        } catch (e) {
            console.error(e);
            showToast('Error: ' + e.message);
        } finally {
            btnRich.innerText = btnText;
            btnRich.style.opacity = '1';
        }
    };

    btnContainer.appendChild(btnMarkdown);
    btnContainer.appendChild(btnRich);
    container.appendChild(btnContainer);

    document.body.appendChild(container);

    // Restore checkbox state from localStorage if you want persistence (optional)
    const savedState = localStorage.getItem('feishu-copy-base64');
    if (savedState === 'true') {
        checkbox.checked = true;
    }
    checkbox.addEventListener('change', () => {
        localStorage.setItem('feishu-copy-base64', checkbox.checked);
    });
}
function showToast(msg) {
    const toast = document.createElement('div');
    toast.innerText = msg;
    toast.className = 'feishu-copy-toast';
    document.body.appendChild(toast);

    // Animation is handled by CSS, but we need to remove it after animation
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 2500); // Wait for CSS animation (2s delay + 0.3s fade out + buffer)
}

// Run init
// Wait for load
if (document.readyState === 'complete') {
    init();
} else {
    window.addEventListener('load', init);
}
