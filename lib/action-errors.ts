export const getActionErrorMessage = (
  error: unknown,
  fallbackMessage: string,
) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
};
