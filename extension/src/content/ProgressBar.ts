export class ProgressBar {
  private container: HTMLDivElement | null = null

  show(current: number, total: number, title: string, status: string) {
    if (!this.container) {
      this.container = document.createElement('div')
      this.container.id = 'ce-progress-bar'
      document.body.appendChild(this.container)
    }

    const progress = Math.round((current / total) * 100)

    this.container.innerHTML = `
      <div class="ce-bar">
        <div class="ce-progress" style="width: ${progress}%"></div>
        <div class="ce-info">
          <span>${title}</span>
          <span>${status} ${current}/${total} (${progress}%)</span>
        </div>
      </div>
    `

    if (!document.getElementById('ce-progress-styles')) {
      const style = document.createElement('style')
      style.id = 'ce-progress-styles'
      style.textContent = `
        #ce-progress-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 999999;
        }
        .ce-bar {
          position: relative;
          height: 40px;
          background: #1a1a1a;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .ce-progress {
          position: absolute;
          height: 100%;
          background: #10b981;
          transition: width 0.3s ease;
        }
        .ce-info {
          position: relative;
          height: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 20px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          font-weight: 600;
          color: white;
          text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }
      `
      document.head.appendChild(style)
    }
  }

  hide() {
    if (this.container) {
      this.container.remove()
      this.container = null
    }
  }
}
