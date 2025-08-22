// Minimal avatar component for user/bot
export default function Avatar({ type }) {
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full shadow ${type === 'bot' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-purple-100 dark:bg-purple-900'}`}>
      {type === 'bot' ? '🤖' : '🧑'}
    </span>
  );
}
