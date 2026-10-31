export const LABEL_TOOL_TEXT = {
  listLabels:
    "List the provider's own labels of each mailbox (Gmail labels, Zoho tags, Outlook categories) with their labelId. Use these labelIds with setLabel, setLabels, clearLabel, renameLabel, deleteLabel and applyProviderLabels; what you change shows in Gmail, Zoho Mail and Outlook.",
  setLabel:
    "Add one provider label (a labelId from listLabels) to an email. The email keeps its other labels.",
  setLabels: "Add one provider label (a labelId from listLabels) to several emails of a mailbox.",
  clearLabel:
    "Remove a provider label from an email, or every provider label it has when labelId is left out.",
  createLabel:
    "Create a provider label in a mailbox: a Gmail label (use / for a nested one, e.g. Clients/Acme), a Zoho tag or an Outlook category. Returns its labelId.",
  renameLabel:
    "Rename a provider label. On Gmail its nested labels follow; Outlook cannot rename a category.",
  deleteLabel:
    "Delete a provider label at the provider. It is removed from every email that has it; the emails themselves stay.",
  renameMailFolder:
    "Rename one of a mailbox's provider folders (a folderId from listMailFolders). Its sub-folders keep their place.",
  moveMailFolder:
    "Move a provider folder inside another folder (parentFolderId from listMailFolders), or to the top level when parentFolderId is left out.",
  deleteMailFolder:
    "Delete a provider folder. On Gmail this deletes the label and its emails stay in All Mail; on Zoho and Outlook the folder's emails go with it (Outlook moves it to Deleted Items). Tell the user what it holds before deleting.",
} as const;
