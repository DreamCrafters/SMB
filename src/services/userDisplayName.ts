const cyrillicNamePartPattern = /^[\p{Script=Cyrillic}’'-]+$/u;
const initialPattern = /^\p{L}\.$/u;
const likelyRussianSurnamePattern =
  /(?:ов|ова|ев|ева|ёв|ёва|ин|ина|ын|ына|ский|ская|цкий|цкая|енко|ко|ук|юк|дзе|швили)$/iu;

export function formatUserShortName(displayName: string) {
  const nameParts = displayName.trim().split(/\s+/).filter(Boolean);

  if (nameParts.length <= 1) {
    return nameParts[0] ?? "";
  }

  if (nameParts.length === 2 && initialPattern.test(nameParts[1] ?? "")) {
    return nameParts.join(" ");
  }

  if (!nameParts.every((part) => cyrillicNamePartPattern.test(part))) {
    return nameParts.join(" ");
  }

  if (nameParts.length >= 3) {
    const firstPart = nameParts[0] ?? "";
    const lastPart = nameParts.at(-1) ?? "";

    if (
      likelyRussianSurnamePattern.test(lastPart) &&
      !likelyRussianSurnamePattern.test(firstPart)
    ) {
      return `${lastPart} ${readInitial(firstPart)}`;
    }

    return `${nameParts[0]} ${readInitial(nameParts[1] ?? "")}`;
  }

  const [firstPart = "", secondPart = ""] = nameParts;
  const firstPartLooksLikeSurname = likelyRussianSurnamePattern.test(firstPart);
  const secondPartLooksLikeSurname = likelyRussianSurnamePattern.test(secondPart);

  if (firstPartLooksLikeSurname && !secondPartLooksLikeSurname) {
    return `${firstPart} ${readInitial(secondPart)}`;
  }

  return `${secondPart} ${readInitial(firstPart)}`;
}

function readInitial(namePart: string) {
  const firstLetter = Array.from(namePart)[0];

  return firstLetter === undefined ? "" : `${firstLetter.toLocaleUpperCase("ru-RU")}.`;
}
