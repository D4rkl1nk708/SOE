import { LearningClassic } from "@/components/learning/LearningClassic";
import { ReadingSurface } from "@/components/learning/ReadingSurface";
import { useCadernoVivo } from "@/components/learning/useCadernoVivo";

/**
 * Caderno Vivo.
 *
 * Duas apresentações, uma regra só: o layout focado (padrão) lê com conforto e
 * estuda no painel lateral; o clássico continua disponível em Perfil →
 * Interface. Toda a lógica fica no `useCadernoVivo`.
 */
export default function Learning() {
  const caderno = useCadernoVivo();
  return caderno.isFocused ? (
    <ReadingSurface caderno={caderno} />
  ) : (
    <LearningClassic caderno={caderno} />
  );
}
