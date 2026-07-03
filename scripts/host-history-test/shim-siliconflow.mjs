export async function embed(texts) {
    return (texts || []).map((_, idx) => [idx + 1, idx + 2, idx + 3]);
}
