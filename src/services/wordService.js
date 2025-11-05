import axios from 'axios';

class WordService {
    constructor() {
        this.categories = {
            science: {
                name: 'Science',
                apiEndpoint: 'https://api.datamuse.com/words',
                wordLength: 5
            },
            computer: {
                name: 'Computer & Technology',
                apiEndpoint: 'https://api.datamuse.com/words',
                wordLength: 5
            },
            nature: {
                name: 'Nature & Environment',
                apiEndpoint: 'https://api.datamuse.com/words',
                wordLength: 5
            },
            space: {
                name: 'Space & Astronomy',
                apiEndpoint: 'https://api.datamuse.com/words',
                wordLength: 5
            },
            food: {
                name: 'Food & Cuisine',
                apiEndpoint: 'https://api.datamuse.com/words',
                wordLength: 5
            }
        };

        // Cache for storing fetched words to avoid repeated API calls
        this.wordCache = new Map();
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    }

    /**
     * Get a random 5-letter word from a specific category via API
     * @param {string} category - The category to get word from
     * @returns {Promise<Object>} - Word object with word, category, and metadata
     */
    async getWordFromCategory(category) {
        if (!this.categories[category]) {
            throw new Error(`Category '${category}' not found. Available categories: ${Object.keys(this.categories).join(', ')}`);
        }

        try {
            // Check cache first
            const cachedWords = this.getCachedWords(category);
            if (cachedWords && cachedWords.length > 0) {
                const randomWord = cachedWords[Math.floor(Math.random() * cachedWords.length)];
                return {
                    word: randomWord.toUpperCase(),
                    category: this.categories[category].name,
                    length: 5,
                    source: 'cache'
                };
            }

            // Fetch from API if not in cache
            const words = await this.fetchWordsFromAPI(category);
            if (words.length === 0) {
                throw new Error(`No 5-letter words found for category: ${category}`);
            }

            // Cache the words
            this.setCachedWords(category, words);

            const randomWord = words[Math.floor(Math.random() * words.length)];
            return {
                word: randomWord.toUpperCase(),
                category: this.categories[category].name,
                length: 5,
                source: 'api'
            };

        } catch (error) {
            console.error(`Error fetching word for category ${category}:`, error.message);
            throw new Error(`Failed to fetch word for category: ${category}`);
        }
    }

    /**
     * Fetch words from API based on category
     * @param {string} category - The category to fetch words for
     * @returns {Promise<Array>} - Array of 5-letter words
     */
    async fetchWordsFromAPI(category) {
        const categoryConfig = this.categories[category];
        let apiParams = {
            sp: '?????', // Exactly 5 characters
            max: 100
        };

        // Add category-specific topics
        switch (category) {
            case 'science':
                apiParams.topics = 'science,physics,chemistry,biology,medicine';
                break;
            case 'computer':
                apiParams.topics = 'computer,technology,programming,software,hardware';
                break;
            case 'nature':
                apiParams.topics = 'nature,environment,plants,animals,weather';
                break;
            case 'space':
                apiParams.topics = 'space,astronomy,planets,stars,universe';
                break;
            case 'food':
                apiParams.topics = 'food,cooking,cuisine,ingredients,meals';
                break;
        }

        try {
            const response = await axios.get(categoryConfig.apiEndpoint, {
                params: apiParams,
                timeout: 10000 // 10 second timeout
            });

            if (response.data && Array.isArray(response.data)) {
                // Filter for exactly 5-letter words and extract word text
                const words = response.data
                    .filter(item => item.word && item.word.length === 5)
                    .map(item => item.word.toUpperCase())
                    .filter((word, index, self) => self.indexOf(word) === index); // Remove duplicates

                return words;
            }

            return [];
        } catch (error) {
            console.error(`API Error for category ${category}:`, error.message);
            return [];
        }
    }

    /**
     * Get multiple words for a game round
     * @param {string} category - The category to get words from
     * @param {number} count - Number of words to return
     * @returns {Promise<Array>} - Array of word objects
     */
    async getWordsForGame(category, count = 1) {
        const words = [];
        const usedWords = new Set();

        for (let i = 0; i < count; i++) {
            let wordObj;
            let attempts = 0;
            const maxAttempts = 20; // Prevent infinite loop

            do {
                wordObj = await this.getWordFromCategory(category);
                attempts++;
            } while (usedWords.has(wordObj.word) && attempts < maxAttempts);

            if (attempts < maxAttempts) {
                usedWords.add(wordObj.word);
                words.push(wordObj);
            }
        }

        return words;
    }

    /**
     * Get a random word from any category
     * @returns {Promise<Object>} - Word object with word, category, and metadata
     */
    async getRandomWord() {
        const categories = Object.keys(this.categories);
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        return await this.getWordFromCategory(randomCategory);
    }

    /**
     * Get cached words for a category
     * @param {string} category - The category to get cached words for
     * @returns {Array|null} - Cached words or null if not found/expired
     */
    getCachedWords(category) {
        const cached = this.wordCache.get(category);
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.words;
        }
        return null;
    }

    /**
     * Set cached words for a category
     * @param {string} category - The category to cache words for
     * @param {Array} words - The words to cache
     */
    setCachedWords(category, words) {
        this.wordCache.set(category, {
            words: words,
            timestamp: Date.now()
        });
    }

    /**
     * Get available categories
     * @returns {Array} - Array of category objects
     */
    getCategories() {
        return Object.keys(this.categories).map(key => ({
            key,
            name: this.categories[key].name,
            wordLength: this.categories[key].wordLength
        }));
    }

    /**
     * Validate if a word exists in the category (checks cache first)
     * @param {string} word - The word to validate
     * @param {string} category - The category to check in
     * @returns {Promise<boolean>} - True if word exists in category
     */
    async validateWord(word, category) {
        if (!this.categories[category]) {
            return false;
        }

        const upperWord = word.toUpperCase();
        if (upperWord.length !== 5) {
            return false;
        }

        // Check cache first
        const cachedWords = this.getCachedWords(category);
        if (cachedWords) {
            return cachedWords.includes(upperWord);
        }

        // If not in cache, fetch and check
        try {
            const words = await this.fetchWordsFromAPI(category);
            this.setCachedWords(category, words);
            return words.includes(upperWord);
        } catch (error) {
            console.error(`Error validating word for category ${category}:`, error.message);
            return false;
        }
    }

    /**
     * Get hints for a word (first and last letter)
     * @param {string} word - The word to get hints for
     * @returns {Object} - Hints object
     */
    getWordHints(word) {
        return {
            firstLetter: word.charAt(0),
            lastLetter: word.charAt(word.length - 1),
            length: word.length,
            category: this.getWordCategory(word)
        };
    }

    /**
     * Find which category a word belongs to (checks cache)
     * @param {string} word - The word to find category for
     * @returns {Promise<string|null>} - Category key or null if not found
     */
    async getWordCategory(word) {
        const upperWord = word.toUpperCase();
        
        for (const categoryKey of Object.keys(this.categories)) {
            const cachedWords = this.getCachedWords(categoryKey);
            if (cachedWords && cachedWords.includes(upperWord)) {
                return categoryKey;
            }
        }
        return null;
    }

    /**
     * Preload words for all categories (useful for warming up cache)
     * @returns {Promise<Object>} - Status of preloading for each category
     */
    async preloadAllCategories() {
        const results = {};
        
        for (const category of Object.keys(this.categories)) {
            try {
                await this.getWordFromCategory(category);
                results[category] = { status: 'success', message: 'Words loaded successfully' };
            } catch (error) {
                results[category] = { status: 'error', message: error.message };
            }
        }
        
        return results;
    }

    /**
     * Clear cache for a specific category or all categories
     * @param {string} category - Optional category to clear, if not provided clears all
     */
    clearCache(category = null) {
        if (category) {
            this.wordCache.delete(category);
        } else {
            this.wordCache.clear();
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache statistics
     */
    getCacheStats() {
        const stats = {
            totalCategories: Object.keys(this.categories).length,
            cachedCategories: this.wordCache.size,
            cacheEntries: []
        };

        for (const [category, data] of this.wordCache.entries()) {
            const age = Date.now() - data.timestamp;
            stats.cacheEntries.push({
                category,
                wordCount: data.words.length,
                ageMinutes: Math.round(age / (1000 * 60)),
                isExpired: age >= this.cacheExpiry
            });
        }

        return stats;
    }
}

const wordService = new WordService();
export default wordService;