/** DOM id of a tab button rendered by `<Tabs idPrefix=…>`. */
export const tabId = (prefix: string, value: string) => `${prefix}-tab-${value}`;

/** DOM id of the panel controlled by `<Tabs idPrefix=…>`. */
export const tabPanelId = (prefix: string) => `${prefix}-panel`;
