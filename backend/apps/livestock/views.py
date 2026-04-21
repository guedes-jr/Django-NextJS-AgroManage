from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import AnimalBatch
from .serializers import AnimalBatchSerializer

class AnimalBatchViewSet(viewsets.ModelViewSet):
    queryset = AnimalBatch.objects.all()
    serializer_class = AnimalBatchSerializer

    @action(detail=False, methods=['post'])
    def bulk_create_batches(self, request):
        serializer = self.get_serializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        self.perform_bulk_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def perform_bulk_create(self, serializer):
        serializer.save()
