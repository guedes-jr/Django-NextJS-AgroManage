from rest_framework import viewsets, status, serializers
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import IntegrityError
from .models import AnimalBatch
from .serializers import AnimalBatchSerializer

class AnimalBatchViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        user = self.request.user
        if user.is_authenticated and hasattr(user, 'organization'):
            return AnimalBatch.objects.filter(farm__organization=user.organization)
        return AnimalBatch.objects.none()

    @action(detail=False, methods=['post'])
    def bulk_create_batches(self, request):
        # Pass request context to serializer
        serializer = self.get_serializer(data=request.data, many=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        self.perform_bulk_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def perform_bulk_create(self, serializer):
        try:
            # Farm/Org injection happens in the serializer's create method
            serializer.save()
        except IntegrityError as e:
            # Handle any integrity errors that slip through validation
            error_msg = str(e)
            if "UNIQUE constraint failed" in error_msg:
                raise serializers.ValidationError(
                    "One or more batch codes already exist for the specified farm(s). "
                    "Please check your data and try again."
                )
            raise
