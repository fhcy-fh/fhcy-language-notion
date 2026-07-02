export interface NotionPropertiesRichTextType {
  type: string
  plain_text: string
}

export interface NotionPropertiesType {
  id: string
  type: string
  rich_text: NotionPropertiesRichTextType[]
}
