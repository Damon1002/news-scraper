import { NewsItem, FeedMetadata, NewsCategory, SourceConfig, CategoryConfig } from '../types/index.js';

export class RSSGenerator {
  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private formatRSSDate(date: Date): string {
    // Convert to UTC and format as RFC 822 date with +0000 timezone
    return date.toUTCString().replace('GMT', '+0000');
  }

  private createRSSItem(item: NewsItem): string {
    const pubDate = this.formatRSSDate(item.publishedAt);
    const escapedTitle = this.escapeXML(item.title);
    const escapedDescription = this.escapeXML(item.description || `News from ${item.source}`);
    const escapedSource = this.escapeXML(item.source);
    
    const categories = item.tags.map(tag => 
      `      <category>${this.escapeXML(tag)}</category>`
    ).join('\n');

    const enclosure = item.imageUrl ? 
      `      <enclosure url="${item.imageUrl}" type="image/jpeg"/>` : '';

    return `    <item>
      <title>${escapedTitle}</title>
      <link>${item.sourceUrl}</link>
      <description>${escapedDescription}</description>
      <pubDate>${pubDate}</pubDate>
      <source>${escapedSource}</source>
      <guid isPermaLink="true">${item.sourceUrl}</guid>
${categories}
${enclosure}
    </item>`;
  }

  public generateRSSFeed(items: NewsItem[], metadata: FeedMetadata): string {
    const rssDate = this.formatRSSDate(metadata.lastBuildDate);
    const categoryTag = metadata.category ? 
      `    <category>${metadata.category}</category>` : '';

    const rssItems = items
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .map(item => this.createRSSItem(item))
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${this.escapeXML(metadata.title)}</title>
    <link>${metadata.link}</link>
    <description>${this.escapeXML(metadata.description)}</description>
    <language>${metadata.language}</language>
    <lastBuildDate>${rssDate}</lastBuildDate>
    <pubDate>${rssDate}</pubDate>
    <ttl>${metadata.ttl}</ttl>
${categoryTag}
    <atom:link href="${metadata.link}" rel="self" type="application/rss+xml"/>
    <generator>Multi-Source News Aggregator</generator>
    <managingEditor>noreply@github.com</managingEditor>
    <webMaster>noreply@github.com</webMaster>
${rssItems}
  </channel>
</rss>`;
  }

  public createSourceFeedMetadata(
    sourceName: string,
    category: NewsCategory,
    baseUrl: string = 'https://damon1002.github.io/news-scraper'
  ): FeedMetadata {
    let categoryName: string;
    let language = 'en-US';

    if (category === 'entertainment') {
      categoryName = '娱乐星闻';
      language = 'zh-TW';
    } else {
      categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    }

    const sourceId = sourceName.toLowerCase().replace(/\s+/g, '-');
    
    return {
      title: category === 'entertainment' ? `${categoryName} - ${sourceName}` : `${categoryName} News - ${sourceName}`,
      description: category === 'entertainment' ? 
        `来自${sourceName}的最新娱乐星闻` : 
        `Latest ${categoryName.toLowerCase()} news from ${sourceName}`,
      link: `${baseUrl}/feeds/${category}/${sourceId}.xml`,
      language,
      category,
      lastBuildDate: new Date(),
      ttl: 60
    };
  }

  public createFeedMetadata(
    category: NewsCategory,
    baseUrl: string = 'https://damon1002.github.io/news-scraper'
  ): FeedMetadata {
    let categoryName: string;
    let categoryDescription: string;
    let language = 'en-US';

    if (category === 'entertainment') {
      categoryName = '娱乐星闻';
      categoryDescription = '来自三立新闻网的最新娱乐星闻';
      language = 'zh-TW';
    } else {
      categoryName = category.charAt(0).toUpperCase() + category.slice(1);
      categoryDescription = `${categoryName} news`;
    }

    return {
      title: category === 'entertainment' ? categoryName : `News Feed - ${categoryName}`,
      description: category === 'entertainment' ? categoryDescription : `Automated ${categoryDescription} aggregated from various sources`,
      link: `${baseUrl}/feeds/${category}.xml`,
      language,
      category,
      lastBuildDate: new Date(),
      ttl: 60
    };
  }

  private getCategoryEmoji(category: NewsCategory, sourceName: string): string {
    // Return appropriate emoji based on category and source
    switch (category) {
      case 'entertainment':
        if (sourceName.includes('SETN')) return '🎬';
        if (sourceName.includes('TVBS')) return '📺';
        if (sourceName.includes('壹苹') || sourceName.includes('NextApple')) return '🍎';
        if (sourceName.includes('HK01')) return '🇭🇰';
        if (sourceName.includes('Page Six')) return '📰';
        return '🎭';
      case 'crypto':
        return '💰';
      case 'technology':
        return '💻';
      case 'business':
        return '💼';
      case 'science':
        return '🔬';
      case 'world':
        return '🌍';
      case 'general':
        return '📰';
      case 'health':
        return '🏥';
      case 'sports':
        return '⚽';
      case 'politics':
        return '🏛️';
      case 'breaking':
        return '🚨';
      default:
        return '📰';
    }
  }

  public generateFeedIndex(categories: NewsCategory[], sources: SourceConfig[]): string {
    // Group enabled sources by category
    const categorizedSources: Record<string, Array<{source: SourceConfig, category: CategoryConfig}>> = {};
    
    sources
      .filter(source => source.enabled)
      .forEach(source => {
        source.categories.forEach(categoryConfig => {
          const category = categoryConfig.category;
          if (!categorizedSources[category]) {
            categorizedSources[category] = [];
          }
          categorizedSources[category].push({ source, category: categoryConfig });
        });
      });

    // Generate feed data for JavaScript
    const feedData = JSON.stringify(categorizedSources, null, 2);
    const lastUpdated = new Date().toISOString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>News Feeds - Multi-Source Aggregator</title>
    <style>${this.getModernTableCSS()}</style>
</head>
<body>
    <main>
        <h1 class="page-title">📰 Multi-Source News Feeds</h1>
        <p class="page-subtitle">Automated news aggregation from multiple sources</p>
        <div id="feed-browser"></div>
    </main>
    
    <script>
        // Feed data from server
        const FEED_DATA = ${feedData};
        const LAST_UPDATED = '${lastUpdated}';
        
        ${this.getModernTableJS()}
    </script>
</body>
</html>`;
  }

  private getModernTableCSS(): string {
    return `
        :root {
            --primary-color: #2563eb;
            --secondary-color: #64748b;
            --success-color: #059669;
            --warning-color: #d97706;
            --error-color: #dc2626;
            --border-color: #e2e8f0;
            --hover-color: #f8fafc;
            --text-primary: #1e293b;
            --text-secondary: #64748b;
            --background: #ffffff;
            --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: var(--text-primary);
            background-color: var(--background);
            margin: 0;
            padding: 0;
        }

        main {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem 1rem;
        }

        .page-title {
            font-size: 2.5rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 0.5rem;
            color: var(--text-primary);
        }

        .page-subtitle {
            font-size: 1.125rem;
            color: var(--text-secondary);
            text-align: center;
            margin-bottom: 2rem;
        }

        .feeds-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 0.5rem;
            overflow: hidden;
            box-shadow: var(--shadow);
            margin-bottom: 2rem;
        }

        .feeds-table thead {
            background-color: #f8fafc;
        }

        .feeds-table th {
            padding: 1rem;
            text-align: left;
            font-weight: 600;
            color: var(--text-primary);
            border-bottom: 1px solid var(--border-color);
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.025em;
        }

        .feeds-table td {
            padding: 1rem;
            border-bottom: 1px solid var(--border-color);
            vertical-align: middle;
        }

        .feeds-table tbody tr:hover {
            background-color: var(--hover-color);
        }

        .feeds-table tbody tr:last-child td {
            border-bottom: none;
        }

        .category-row {
            cursor: pointer;
            user-select: none;
        }

        .category-row:hover {
            background-color: var(--hover-color) !important;
        }

        .category-cell {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: 600;
        }

        .category-icon {
            font-size: 1.125rem;
        }

        .expand-icon {
            transition: transform 0.2s ease;
            font-size: 0.875rem;
            color: var(--text-secondary);
        }

        .expand-icon.expanded {
            transform: rotate(90deg);
        }

        .feed-row {
            background-color: #fafbfc;
            display: none;
        }

        .feed-row.show {
            display: table-row;
        }

        .feed-name {
            padding-left: 2rem;
            color: var(--text-secondary);
        }

        .feed-link {
            color: var(--primary-color);
            text-decoration: none;
            font-weight: 500;
        }

        .feed-link:hover {
            text-decoration: underline;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.025em;
        }

        .status-active {
            background-color: #dcfce7;
            color: var(--success-color);
        }

        .status-inactive {
            background-color: #fef3c7;
            color: var(--warning-color);
        }

        .status-error {
            background-color: #fee2e2;
            color: var(--error-color);
        }

        .relative-time {
            color: var(--text-secondary);
            font-size: 0.875rem;
        }

        .stats-row {
            background-color: #f1f5f9;
            font-weight: 500;
        }

        .stats-row td {
            color: var(--text-secondary);
            font-size: 0.875rem;
        }

        .folder-icon {
            color: #f59e0b;
        }

        .single-feed-icon {
            color: var(--text-secondary);
        }

        @media (max-width: 768px) {
            .page-title {
                font-size: 2rem;
            }

            .feeds-table {
                font-size: 0.875rem;
            }

            .feeds-table th,
            .feeds-table td {
                padding: 0.75rem 0.5rem;
            }

            .feed-name {
                padding-left: 1.5rem;
            }
        }
    `;
  }

  private getModernTableJS(): string {
    return `
        class FeedBrowser {
            constructor() {
                this.feedData = FEED_DATA;
                this.lastUpdated = new Date(LAST_UPDATED);
                this.expandedCategories = new Set();
                this.init();
            }

            init() {
                this.render();
                this.bindEvents();
            }

            getCategoryEmoji(category) {
                const emojiMap = {
                    'entertainment': '🎭',
                    'crypto': '💰',
                    'technology': '💻',
                    'business': '💼',
                    'science': '🔬',
                    'world': '🌍',
                    'general': '📰',
                    'health': '🏥',
                    'sports': '⚽',
                    'politics': '🏛️',
                    'breaking': '🚨'
                };
                return emojiMap[category] || '📰';
            }

            getRelativeTime(date) {
                const now = new Date();
                const diffMs = now - date;
                const diffMins = Math.floor(diffMs / (1000 * 60));
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                if (diffMins < 1) return 'Just now';
                if (diffMins < 60) return \`\${diffMins} min\${diffMins === 1 ? '' : 's'} ago\`;
                if (diffHours < 24) return \`\${diffHours} hour\${diffHours === 1 ? '' : 's'} ago\`;
                return \`\${diffDays} day\${diffDays === 1 ? '' : 's'} ago\`;
            }

            getFeedStatus(source) {
                // Simulate feed status - in real implementation, this would check actual feed health
                const random = Math.random();
                if (random > 0.9) return { status: 'error', text: 'Feed Error' };
                if (random > 0.8) return { status: 'inactive', text: 'Stale' };
                return { status: 'active', text: 'Active' };
            }

            render() {
                const container = document.getElementById('feed-browser');
                const categories = Object.keys(this.feedData).sort();
                
                let tableHTML = \`
                    <table class="feeds-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Category</th>
                                <th>Modified</th>
                                <th>Size</th>
                            </tr>
                        </thead>
                        <tbody>
                \`;

                categories.forEach(category => {
                    const sources = this.feedData[category];
                    const categoryEmoji = this.getCategoryEmoji(category);
                    const isMultiple = sources.length > 1;
                    const categoryDisplayName = category.charAt(0).toUpperCase() + category.slice(1);

                    if (isMultiple) {
                        // Category row with folder icon
                        tableHTML += \`
                            <tr class="category-row" data-category="\${category}">
                                <td class="category-cell">
                                    <span class="category-icon folder-icon">📁</span>
                                    <span>\${categoryDisplayName}</span>
                                    <span class="expand-icon">▶</span>
                                </td>
                                <td>\${categoryEmoji} \${categoryDisplayName}</td>
                                <td class="relative-time">\${this.getRelativeTime(this.lastUpdated)}</td>
                                <td>\${sources.length} feed\${sources.length === 1 ? '' : 's'}</td>
                            </tr>
                        \`;

                        // Individual feed rows (initially hidden)
                        sources.forEach(({ source, category: categoryConfig }) => {
                            const feedStatus = this.getFeedStatus(source);
                            const feedPath = \`feeds/\${category}/\${source.id}.xml\`;
                            
                            tableHTML += \`
                                <tr class="feed-row" data-parent="\${category}">
                                    <td class="feed-name">
                                        <a href="\${feedPath}" class="feed-link">\${source.name}</a>
                                    </td>
                                    <td>\${categoryEmoji} \${categoryDisplayName}</td>
                                    <td class="relative-time">\${this.getRelativeTime(this.lastUpdated)}</td>
                                    <td>
                                        <span class="status-badge status-\${feedStatus.status}">\${feedStatus.text}</span>
                                    </td>
                                </tr>
                            \`;
                        });
                    } else {
                        // Single feed in category - show directly
                        const source = sources[0].source;
                        const feedStatus = this.getFeedStatus(source);
                        const feedPath = \`feeds/\${category}/\${source.id}.xml\`;
                        
                        tableHTML += \`
                            <tr>
                                <td class="category-cell">
                                    <span class="category-icon single-feed-icon">📄</span>
                                    <a href="\${feedPath}" class="feed-link">\${source.name}</a>
                                </td>
                                <td>\${categoryEmoji} \${categoryDisplayName}</td>
                                <td class="relative-time">\${this.getRelativeTime(this.lastUpdated)}</td>
                                <td>
                                    <span class="status-badge status-\${feedStatus.status}">\${feedStatus.text}</span>
                                </td>
                            </tr>
                        \`;
                    }
                });

                // Add summary stats row
                const totalFeeds = Object.values(this.feedData).reduce((sum, sources) => sum + sources.length, 0);
                const totalCategories = categories.length;
                
                tableHTML += \`
                            <tr class="stats-row">
                                <td colspan="4">
                                    <strong>Summary:</strong> \${totalFeeds} feed\${totalFeeds === 1 ? '' : 's'} across \${totalCategories} categor\${totalCategories === 1 ? 'y' : 'ies'}
                                    • Last updated: \${this.getRelativeTime(this.lastUpdated)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                \`;

                container.innerHTML = tableHTML;
            }

            bindEvents() {
                document.addEventListener('click', (e) => {
                    const categoryRow = e.target.closest('.category-row');
                    if (categoryRow) {
                        const category = categoryRow.dataset.category;
                        this.toggleCategory(category);
                    }
                });
            }

            toggleCategory(category) {
                const expandIcon = document.querySelector(\`[data-category="\${category}"] .expand-icon\`);
                const feedRows = document.querySelectorAll(\`[data-parent="\${category}"]\`);
                
                if (this.expandedCategories.has(category)) {
                    // Collapse
                    this.expandedCategories.delete(category);
                    expandIcon.classList.remove('expanded');
                    feedRows.forEach(row => row.classList.remove('show'));
                } else {
                    // Expand
                    this.expandedCategories.add(category);
                    expandIcon.classList.add('expanded');
                    feedRows.forEach(row => row.classList.add('show'));
                }
            }
        }

        // Initialize when DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            new FeedBrowser();
        });
    `;
  }
}