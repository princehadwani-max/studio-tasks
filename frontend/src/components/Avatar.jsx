export function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function Avatar({ name, role, size }) {
  return (
    <div
      className={`avatar role-${role}`}
      style={size ? { width: size, height: size, fontSize: size * 0.4 } : undefined}
    >
      {initials(name)}
    </div>
  );
}
