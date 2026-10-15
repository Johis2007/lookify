import React, { useEffect, useRef, useState } from 'react';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './AppNavigator';
import { ProfessionalSessionRouteParams } from '../types/professionalAuth';
import {
  extractIncomingRequestIdFromState,
  extractProfessionalSessionParams,
  getActiveProfessionalRouteName,
} from './professionalSessionFromState';
import { getProfessionalIncomingRequestService } from '../services/professionalIncomingRequestService';
import { getProfessionalDashboardService } from '../services/professionalDashboardService';
import { getActiveSolicitudKnown } from '../services/incomingActive';
import { SolicitudEntrante } from '../types/professionalIncomingRequest';

const DISPONIBILIDAD_POLL_MS = 1500;

function esSolicitudVigente(s: SolicitudEntrante | null): s is SolicitudEntrante {
  return (
    s != null && (s.estado === 'PENDIENTE_PRO' || s.estado === 'ESPERANDO_CLIENTE')
  );
}

function abrirSolicitudEntranteEnStackPro(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  sess: ProfessionalSessionRouteParams,
  solicitudEntranteId: string
): void {
  navigation.navigate('ProfessionalApp', {
    screen: 'ProfessionalIncomingRequest',
    params: {
      ...sess,
      solicitudEntranteId,
    },
  });
}

export default function ProfessionalIncomingRequestListener() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const navState = useNavigationState((state) => state);
  const session = extractProfessionalSessionParams(navState);
  const routeName = getActiveProfessionalRouteName(navState);
  const incomingIdOnScreen = extractIncomingRequestIdFromState(navState);
  const profesionalId = session?.profesionalId;

  const [disponible, setDisponible] = useState(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const routeNameRef = useRef(routeName);
  routeNameRef.current = routeName;
  const incomingIdRef = useRef(incomingIdOnScreen);
  incomingIdRef.current = incomingIdOnScreen;
  const ultimaSolicitudPresentadaRef = useRef<string | null>(null);

  useEffect(() => {
    if (routeName !== 'ProfessionalIncomingRequest') {
      ultimaSolicitudPresentadaRef.current = null;
    }
  }, [routeName]);

  useEffect(() => {
    if (!profesionalId) {
      setDisponible(false);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await getProfessionalDashboardService().consultarDisponibilidad({
          profesionalId,
        });
        if (!cancelled) {
          setDisponible(res.disponibilidad === 'DISPONIBLE');
        }
      } catch {
        if (!cancelled) {
          setDisponible(false);
        }
      }
    };
    void poll();
    const interval = setInterval(() => {
      void poll();
    }, DISPONIBILIDAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [profesionalId]);

  useEffect(() => {
    if (!profesionalId || !disponible) {
      return;
    }

    const svc = getProfessionalIncomingRequestService();

    void svc.obtenerSolicitudActiva({ profesionalId }).then((activa) => {
      if (!esSolicitudVigente(activa)) {
        return;
      }
      if (routeNameRef.current === 'ProfessionalIncomingRequest') {
        return;
      }
      if (ultimaSolicitudPresentadaRef.current === activa.id) {
        return;
      }
      const sess = sessionRef.current;
      if (!sess) {
        return;
      }
      ultimaSolicitudPresentadaRef.current = activa.id;
      abrirSolicitudEntranteEnStackPro(navigation, sess, activa.id);
    });

    const unsub = svc.suscribirseASolicitudesEntrantes({ profesionalId }, (evento) => {
      if (evento.tipo !== 'NUEVA') {
        return;
      }

      const idEnPantalla = incomingIdRef.current;
      if (
        routeNameRef.current === 'ProfessionalIncomingRequest' &&
        idEnPantalla === evento.solicitud.id
      ) {
        return;
      }
      if (routeNameRef.current === 'ProfessionalIncomingRequest') {
        return;
      }

      const activaStore = getActiveSolicitudKnown(profesionalId);
      if (esSolicitudVigente(activaStore) && activaStore.id !== evento.solicitud.id) {
        return;
      }

      if (ultimaSolicitudPresentadaRef.current === evento.solicitud.id) {
        return;
      }

      const sess = sessionRef.current;
      if (!sess) {
        return;
      }
      ultimaSolicitudPresentadaRef.current = evento.solicitud.id;
      abrirSolicitudEntranteEnStackPro(navigation, sess, evento.solicitud.id);
    });

    return unsub;
  }, [profesionalId, disponible, navigation]);

  return null;
}
