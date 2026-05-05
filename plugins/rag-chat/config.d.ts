export interface Config {
  /**
   * RAG Chat Configuration
   * @visibility frontend
   */
  ragChat?: {
    /**
     * @visibility frontend
     */
    defaultModelId?: string;
    /**
     * @visibility frontend
     */
    defaultSourceIds?: string[];
    /**
     * @visibility frontend
     */
    permission?: {
      /**
       * @visibility frontend
       */
      enabled?: boolean;
    };
    /**
     * @visibility frontend
     */
    sources?: Array<{
      /**
       * @visibility frontend
       */
      id: string;
      /**
       * @visibility frontend
       */
      name: string;
      /**
       * @visibility frontend
       */
      type: 'catalog' | 'techdocs' | 'custom';
      /**
       * @visibility frontend
       */
      description?: string;
    }>;
    /**
     * @visibility frontend
     */
    providers?: {
      /**
       * @visibility frontend
       */
      type?: 'openai' | 'anthropic' | 'google' | 'custom';
      /**
       * @visibility secret
       */
      apiToken?: string;
      /**
       * @visibility frontend
       */
      apiBaseUrl?: string;
      /**
       * @visibility frontend
       */
      embedding?: {
        /**
         * @visibility frontend
         */
        model?: string;
        /**
         * @visibility secret
         */
        apiToken?: string;
        /**
         * @visibility frontend
         */
        apiBaseUrl?: string;
      };
      /**
       * @visibility frontend
       */
      chatModel?: Array<{
        /**
         * @visibility frontend
         */
        id: string;
        /**
         * @visibility frontend
         */
        name: string;
        /**
         * @visibility secret
         */
        apiToken?: string;
        /**
         * @visibility frontend
         */
        apiBaseUrl?: string;
      }>;
    };
  };
}
